from __future__ import annotations
import random
from typing import Optional
from .models import GameState, Event, Order, Operation

EVENT_TYPES = ["breakdown", "supply_delay", "qc_recheck", "rush_order", "no_operator", "overload"]

DESCRIPTIONS = {
    "breakdown": "Поломка станка {name}. Простой ~{dur} мин.",
    "supply_delay": "Задержка поставки материала для {order_id}: +{dur} мин.",
    "qc_recheck": "ОТК требует повторный контроль операции на {name}: +{dur} мин.",
    "rush_order": "Срочный заказ {order_id} принят, дедлайн +90 мин (приоритет 1).",
    "no_operator": "Оператор отсутствует на {name}. Простой ~{dur} мин.",
    "overload": "Перегрузка участка типа {mtype}: скорость 50% на {dur} мин.",
}


def _next_event_id(state: GameState) -> str:
    return f"EV-{len(state.events) + 1:03d}"


def _next_order_id(state: GameState) -> str:
    nums = [int(o.id.split("-")[1]) for o in state.orders]
    return f"ORD-{(max(nums) + 1) if nums else 1:03d}"


def trigger_random_event(state: GameState, products: dict, etype: Optional[str] = None) -> Event:
    etype = etype or random.choice(EVENT_TYPES)
    eid = _next_event_id(state)
    machine_id = None
    payload = {}
    duration = 0
    desc = ""

    if etype == "breakdown":
        m = random.choice([x for x in state.machines if x.status == "idle" or x.status == "busy"])
        duration = random.randint(15, 60)
        machine_id = m.id
        m.status = "broken"
        m.busy_until = max(m.busy_until, state.now + duration)
        desc = DESCRIPTIONS["breakdown"].format(name=m.name_ru, dur=duration)
    elif etype == "no_operator":
        m = random.choice([x for x in state.machines if x.status in ("idle", "busy")])
        duration = random.randint(30, 90)
        machine_id = m.id
        m.status = "no_operator"
        m.busy_until = max(m.busy_until, state.now + duration)
        desc = DESCRIPTIONS["no_operator"].format(name=m.name_ru, dur=duration)
    elif etype == "supply_delay":
        order = random.choice(state.orders)
        duration = random.randint(30, 120)
        payload = {"order_id": order.id}
        desc = DESCRIPTIONS["supply_delay"].format(order_id=order.id, dur=duration)
    elif etype == "qc_recheck":
        qc_machines = [m for m in state.machines if m.type == "qc"]
        m = qc_machines[0] if qc_machines else random.choice(state.machines)
        duration = random.randint(10, 25)
        machine_id = m.id
        qc_ops = [op for o in state.orders for op in o.operations if op.machine_type == "qc" and not op.done]
        if qc_ops:
            op = random.choice(qc_ops)
            payload = {"op_id": op.id, "order_id": op.order_id}
        desc = DESCRIPTIONS["qc_recheck"].format(name=m.name_ru, dur=duration)
    elif etype == "rush_order":
        new_id = _next_order_id(state)
        product = random.choice(list(products.keys()))
        ops = [
            Operation(
                id=f"OP-{new_id.split('-')[1]}-{i+1}",
                order_id=new_id,
                machine_type=step["machine_type"],
                duration_min=step["duration_min"],
                seq=i + 1,
                consumes=step.get("consumes", {}),
                produces=step.get("produces", {}),
            )
            for i, step in enumerate(products[product])
        ]
        new_order = Order(id=new_id, product=product, deadline_min=state.now + 90, priority=1, qty=10, operations=ops)
        state.orders.append(new_order)
        payload = {"order_id": new_id, "product": product}
        desc = DESCRIPTIONS["rush_order"].format(order_id=new_id)
    elif etype == "overload":
        mtype = random.choice(list({m.type for m in state.machines}))
        duration = random.randint(60, 120)
        payload = {"machine_type": mtype}
        desc = DESCRIPTIONS["overload"].format(mtype=mtype, dur=duration)

    ev = Event(
        id=eid,
        type=etype,
        machine_id=machine_id,
        triggered_at=state.now,
        duration_min=duration,
        description_ru=desc,
        payload=payload,
    )
    if etype == "rush_order":
        ev.resolved = True
    state.events.append(ev)
    return ev


def auto_resolve_events(state: GameState) -> None:
    """Автоматически закрывает события по истечении окна действия."""
    for ev in state.events:
        if ev.resolved:
            continue
        if ev.duration_min > 0 and state.now >= ev.triggered_at + ev.duration_min:
            if ev.type in ("breakdown", "no_operator") and ev.machine_id:
                m = next((x for x in state.machines if x.id == ev.machine_id), None)
                if m and m.status in ("broken", "no_operator"):
                    m.status = "idle"
            ev.resolved = True
