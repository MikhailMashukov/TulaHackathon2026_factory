from __future__ import annotations
import json
import logging
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .models import GameState, Machine, Order, Operation, ScheduledOp
from .scheduler import effective_duration_min, replan
from .events import trigger_random_event, auto_resolve_events
from .scoring import compute_score
from .copilot import suggest as copilot_suggest

DATA_PATH = Path(__file__).parent / "data" / "sample_orders.json"
STATIC_PATH = Path(__file__).resolve().parent.parent / "static"
LOG_PATH = Path(__file__).resolve().parent.parent / "factory.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-5s  %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.FileHandler(LOG_PATH, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("factory")

app = FastAPI(title="Весёлый плановик")

state = GameState()
products: dict = {}


def load_initial() -> None:
    global products
    with open(DATA_PATH, encoding="utf-8") as f:
        data = json.load(f)
    state.machines = [Machine(**m) for m in data["machines"]]
    products = data["products"]
    orders = []
    for o in data["orders"]:
        order_num = o["id"].split("-")[1]
        ops = [
            Operation(
                id=f"OP-{order_num}-{i+1}",
                order_id=o["id"],
                machine_type=step["machine_type"],
                duration_min=step["duration_min"],
                seq=i + 1,
                consumes=step.get("consumes", {}),
                produces=step.get("produces", {}),
            )
            for i, step in enumerate(products[o["product"]])
        ]
        orders.append(
            Order(
                id=o["id"],
                product=o["product"],
                deadline_min=o["deadline_min"],
                priority=o["priority"],
                qty=o.get("qty", 10),
                operations=ops,
            )
        )
    state.orders = orders
    state.now = 0
    state.events = []
    state.advice_log = []
    state.schedule = replan(state)
    state.score = compute_score(state)


load_initial()
log.info("Server started, %d machines, %d orders loaded", len(state.machines), len(state.orders))


@app.get("/api/state")
def get_state():
    return state.to_dict()


class TickReq(BaseModel):
    minutes: int = 60


@app.post("/api/tick")
def tick(req: TickReq):
    state.now = min(state.now + req.minutes, state.horizon_min)
    auto_resolve_events(state)
    state.score = compute_score(state)
    log.info("tick +%d min → now=%d  score=%.1f", req.minutes, state.now, state.score.get("total", 0))
    return state.to_dict()


@app.post("/api/schedule/replan")
def do_replan():
    state.schedule = replan(state)
    state.score = compute_score(state)
    log.info("replan → %d ops scheduled, score=%.1f", len(state.schedule), state.score.get("total", 0))
    return state.to_dict()


class MoveReq(BaseModel):
    op_id: str
    machine_id: str
    start_min: int


@app.post("/api/schedule/move")
def move_op(req: MoveReq):
    target = next((s for s in state.schedule if s.op_id == req.op_id), None)
    if not target:
        raise HTTPException(404, f"op {req.op_id} not in schedule")
    machine = next((m for m in state.machines if m.id == req.machine_id), None)
    if not machine:
        raise HTTPException(404, f"machine {req.machine_id} not found")
    op = next((op for o in state.orders for op in o.operations if op.id == req.op_id), None)
    if not op:
        raise HTTPException(404, f"op definition {req.op_id} not found")
    if machine.type != op.machine_type:
        raise HTTPException(400, f"machine type {machine.type} != op type {op.machine_type}")

    target.machine_id = req.machine_id
    target.start_min = req.start_min
    order = next((o for o in state.orders if o.id == op.order_id), None)
    qty = order.qty if order else 1
    target.end_min = req.start_min + effective_duration_min(state, op, req.start_min, qty)
    state.score = compute_score(state)
    log.info("move %s → %s @%d, score=%.1f", req.op_id, req.machine_id, req.start_min, state.score.get("total", 0))
    return state.to_dict()


class EventReq(BaseModel):
    type: Optional[str] = None


@app.post("/api/event/random")
def event_random(req: Optional[EventReq] = None):
    etype = req.type if req else None
    ev = trigger_random_event(state, products, etype=etype)
    state.schedule = replan(state)
    state.score = compute_score(state)
    log.info("event %s type=%s: %s", ev.id, ev.type, ev.description_ru)
    return {"event": ev.__dict__, "state": state.to_dict()}


@app.post("/api/event/{event_id}/resolve")
def event_resolve(event_id: str):
    ev = next((e for e in state.events if e.id == event_id), None)
    if not ev:
        raise HTTPException(404, f"event {event_id} not found")
    ev.resolved = True
    if ev.machine_id:
        m = next((x for x in state.machines if x.id == ev.machine_id), None)
        if m and m.status in ("broken", "no_operator"):
            m.status = "idle"
    state.score = compute_score(state)
    log.info("resolve %s (%s)", event_id, ev.type)
    return state.to_dict()


class CopilotReq(BaseModel):
    event_id: Optional[str] = None
    free_text: Optional[str] = None


@app.post("/api/copilot/suggest")
def copilot(req: CopilotReq):
    ev = None
    if req.event_id:
        ev = next((e for e in state.events if e.id == req.event_id), None)
    elif state.events:
        ev = next((e for e in reversed(state.events) if not e.resolved), None)
    result = copilot_suggest(state, ev, req.free_text)
    state.advice_log.append({"now": state.now, "event_id": ev.id if ev else None, **result})
    log.info("copilot suggest (source=%s) for event=%s", result.get("source"), ev.id if ev else "none")
    return result


@app.post("/api/reset")
def reset():
    load_initial()
    log.info("reset → %d machines, %d orders", len(state.machines), len(state.orders))
    return state.to_dict()


@app.get("/")
def root():
    return FileResponse(STATIC_PATH / "index.html")


app.mount("/static", StaticFiles(directory=str(STATIC_PATH)), name="static")
