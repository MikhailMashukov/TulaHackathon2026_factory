from __future__ import annotations
import math
from typing import List, Dict, Tuple, Optional
from .models import GameState, Machine, Order, Operation, ScheduledOp


def _machines_of_type(state: GameState, mtype: str) -> List[Machine]:
    return [m for m in state.machines if m.type == mtype]


def _active_supply_delay_until(state: GameState) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for ev in state.events:
        if ev.resolved or ev.type != "supply_delay":
            continue
        order_id = ev.payload.get("order_id")
        if not order_id:
            continue
        out[order_id] = max(out.get(order_id, state.now), ev.triggered_at + ev.duration_min)
    return out


def _active_overload_until(state: GameState) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for ev in state.events:
        if ev.resolved or ev.type != "overload":
            continue
        mtype = ev.payload.get("machine_type")
        if not mtype:
            continue
        out[mtype] = max(out.get(mtype, state.now), ev.triggered_at + ev.duration_min)
    return out


def _active_qc_recheck_extra(state: GameState) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for ev in state.events:
        if ev.resolved or ev.type != "qc_recheck":
            continue
        op_id = ev.payload.get("op_id")
        if not op_id:
            continue
        out[op_id] = out.get(op_id, 0) + ev.duration_min
    return out


def effective_duration_min(state: GameState, op: Operation, start_min: int) -> int:
    """Расчёт длительности операции с учётом активных событий."""
    duration = op.duration_min

    # qc_recheck: добавочный цикл проверки конкретной операции.
    extra_qc = _active_qc_recheck_extra(state).get(op.id, 0)
    duration += extra_qc

    # overload: скорость 50% (т.е. операция длится в 2 раза дольше) пока окно активно.
    overload_until = _active_overload_until(state).get(op.machine_type, 0)
    if overload_until and start_min < overload_until:
        duration = int(math.ceil(duration * 2))

    return duration


def replan(state: GameState) -> List[ScheduledOp]:
    """Greedy + EDD: операции в порядке (priority, deadline). Каждая операция кладётся
    на самый раннедоступный станок нужного типа, с учётом окончания предыдущей операции
    того же заказа."""
    schedule: List[ScheduledOp] = []
    machine_free_at: Dict[str, int] = {m.id: max(state.now, m.busy_until) for m in state.machines}
    order_op_end: Dict[str, int] = {o.id: state.now for o in state.orders}

    sorted_orders = sorted(state.orders, key=lambda o: (o.priority, o.deadline_min))
    order_blocked_until = _active_supply_delay_until(state)
    pending: List[Tuple[Order, Operation]] = []
    for o in sorted_orders:
        for op in sorted(o.operations, key=lambda x: x.seq):
            if not op.done:
                pending.append((o, op))

    # Простой sweep: каждой операции — самый ранний слот.
    for order, op in pending:
        candidates = _machines_of_type(state, op.machine_type)
        if not candidates:
            continue
        broken_or_blocked = {m.id for m in candidates if m.status in ("broken", "no_operator")}

        best_id: Optional[str] = None
        best_start: int = 10**9
        for m in candidates:
            if m.id in broken_or_blocked:
                # станок недоступен только пока не resolve — но плановик строит "идеальный" план
                # без учёта поломок (поломки — это runtime-сюрприз). Для простоты MVP: блокированный
                # станок просто пропускается — пусть операция уедет на однотипный.
                continue
            earliest = max(machine_free_at[m.id], order_op_end[order.id], order_blocked_until.get(order.id, state.now))
            if earliest < best_start:
                best_start = earliest
                best_id = m.id

        if best_id is None:
            # все однотипные сломаны/заблокированы — кладём на первый, увеличив старт на длительность блокировки
            m = candidates[0]
            best_id = m.id
            best_start = max(machine_free_at[m.id], order_op_end[order.id], order_blocked_until.get(order.id, state.now))

        end = best_start + effective_duration_min(state, op, best_start)
        schedule.append(ScheduledOp(op_id=op.id, machine_id=best_id, start_min=best_start, end_min=end))
        machine_free_at[best_id] = end
        order_op_end[order.id] = end

    return schedule


def order_completion_min(state: GameState, order_id: str) -> Optional[int]:
    """Возвращает игровую минуту, к которой все операции заказа завершены по текущему плану."""
    ops_for_order = [s for s in state.schedule if s.op_id.startswith(f"OP-{order_id.split('-')[1]}-")]
    if not ops_for_order:
        return None
    return max(s.end_min for s in ops_for_order)
