import json
from pathlib import Path
from src.models import GameState, Machine, Order, Operation
from src.scheduler import replan
from src.scoring import compute_score
from src.events import trigger_random_event

DATA_PATH = Path(__file__).parent.parent / "src" / "data" / "sample_orders.json"


def _load_state():
    with open(DATA_PATH, encoding="utf-8") as f:
        data = json.load(f)
    state = GameState()
    state.machines = [Machine(**m) for m in data["machines"]]
    products = data["products"]
    for o in data["orders"]:
        order_num = o["id"].split("-")[1]
        ops = [
            Operation(
                id=f"OP-{order_num}-{i+1}",
                order_id=o["id"],
                machine_type=step["machine_type"],
                duration_min=step["duration_min"],
                seq=i + 1,
            )
            for i, step in enumerate(products[o["product"]])
        ]
        state.orders.append(
            Order(id=o["id"], product=o["product"], deadline_min=o["deadline_min"], priority=o["priority"], operations=ops)
        )
    return state, products


def test_replan_produces_schedule():
    state, _ = _load_state()
    schedule = replan(state)
    assert len(schedule) == sum(len(o.operations) for o in state.orders)
    # все операции положены на станок правильного типа
    for s in schedule:
        op = next(op for o in state.orders for op in o.operations if op.id == s.op_id)
        m = next(m for m in state.machines if m.id == s.machine_id)
        assert m.type == op.machine_type
    # старт >= 0, end > start
    for s in schedule:
        assert s.start_min >= 0
        assert s.end_min > s.start_min


def test_no_overlap_per_machine():
    state, _ = _load_state()
    state.schedule = replan(state)
    by_machine = {}
    for s in state.schedule:
        by_machine.setdefault(s.machine_id, []).append(s)
    for mid, ops in by_machine.items():
        ops.sort(key=lambda x: x.start_min)
        for a, b in zip(ops, ops[1:]):
            assert a.end_min <= b.start_min, f"overlap on {mid}: {a.op_id} → {b.op_id}"


def test_op_sequence_within_order():
    state, _ = _load_state()
    state.schedule = replan(state)
    for o in state.orders:
        ops = sorted([s for s in state.schedule if any(op.id == s.op_id for op in o.operations)], key=lambda x: int(x.op_id.split("-")[2]))
        for a, b in zip(ops, ops[1:]):
            assert a.end_min <= b.start_min, f"order {o.id} sequence broken: {a.op_id} → {b.op_id}"


def test_score_in_range():
    state, _ = _load_state()
    state.schedule = replan(state)
    score = compute_score(state)
    for k in ("on_time", "idle", "balance", "defects", "resilience", "total"):
        assert 0 <= score[k] <= 100, f"{k} = {score[k]}"


def test_events_produce_event_object():
    state, products = _load_state()
    state.schedule = replan(state)
    for etype in ["breakdown", "rush_order", "no_operator", "supply_delay", "qc_recheck", "overload"]:
        ev = trigger_random_event(state, products, etype=etype)
        assert ev.id
        assert ev.type == etype
        assert ev.description_ru
