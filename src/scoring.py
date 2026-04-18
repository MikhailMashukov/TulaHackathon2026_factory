from __future__ import annotations
import statistics
from .models import GameState

WEIGHTS = {
    "on_time": 0.35,
    "idle": 0.20,
    "balance": 0.15,
    "defects": 0.10,
    "resilience": 0.20,
}


def compute_score(state: GameState) -> dict:
    n_orders = len(state.orders) or 1

    # on_time: завершённые по графику до дедлайна
    on_time_count = 0
    for o in state.orders:
        ops = [s for s in state.schedule if any(op.id == s.op_id for op in o.operations)]
        if not ops:
            continue
        end = max(s.end_min for s in ops)
        if end <= o.deadline_min:
            on_time_count += 1
    on_time = on_time_count / n_orders * 100

    # idle: суммарный простой станков на горизонте
    horizon = max(state.horizon_min, max((s.end_min for s in state.schedule), default=state.horizon_min))
    total_capacity = horizon * len(state.machines) if state.machines else 1
    busy = sum(s.end_min - s.start_min for s in state.schedule)
    idle_pct = max(0, 100 - (total_capacity - busy) / total_capacity * 100)

    # balance: stdev загрузки машин
    load_per_machine = {m.id: 0 for m in state.machines}
    for s in state.schedule:
        load_per_machine[s.machine_id] = load_per_machine.get(s.machine_id, 0) + (s.end_min - s.start_min)
    loads = list(load_per_machine.values())
    if len(loads) > 1 and max(loads) > 0:
        norm = [l / max(loads) for l in loads]
        balance = max(0, 100 - statistics.stdev(norm) * 100)
    else:
        balance = 100

    # defects: пока ставим заглушку 95% (брака нет в MVP)
    defects = 95.0

    # resilience: если есть события и среди них есть резолвед без сорванных дедлайнов
    n_events = len([e for e in state.events]) or 0
    if n_events == 0:
        resilience = 100.0
    else:
        # простая эвристика: события за вычетом "поздно завершённых" заказов
        late = n_orders - on_time_count
        resilience = max(0, 100 - late / max(n_events, 1) * 100)

    components = {
        "on_time": round(on_time, 1),
        "idle": round(idle_pct, 1),
        "balance": round(balance, 1),
        "defects": round(defects, 1),
        "resilience": round(resilience, 1),
    }
    total = sum(components[k] * WEIGHTS[k] for k in WEIGHTS)
    components["total"] = round(total, 1)
    components["weights"] = WEIGHTS
    return components
