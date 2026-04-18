from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Optional, List, Dict


@dataclass
class Machine:
    id: str
    type: str
    name_ru: str
    status: str = "idle"
    busy_until: int = 0


@dataclass
class Operation:
    id: str
    order_id: str
    machine_type: str
    duration_min: int
    seq: int
    consumes: Dict[str, int] = field(default_factory=dict)
    produces: Dict[str, int] = field(default_factory=dict)
    done: bool = False


@dataclass
class Order:
    id: str
    product: str
    deadline_min: int
    priority: int
    qty: int = 10
    operations: List[Operation] = field(default_factory=list)


@dataclass
class Event:
    id: str
    type: str
    machine_id: Optional[str]
    triggered_at: int
    duration_min: int
    description_ru: str
    resolved: bool = False
    payload: Dict = field(default_factory=dict)


@dataclass
class ScheduledOp:
    op_id: str
    machine_id: str
    start_min: int
    end_min: int


@dataclass
class GameState:
    now: int = 0
    machines: List[Machine] = field(default_factory=list)
    orders: List[Order] = field(default_factory=list)
    schedule: List[ScheduledOp] = field(default_factory=list)
    events: List[Event] = field(default_factory=list)
    score: Dict = field(default_factory=dict)
    advice_log: List[Dict] = field(default_factory=list)
    horizon_min: int = 480

    def to_dict(self) -> dict:
        return {
            "now": self.now,
            "horizon_min": self.horizon_min,
            "machines": [asdict(m) for m in self.machines],
            "orders": [
                {
                    "id": o.id,
                    "product": o.product,
                    "deadline_min": o.deadline_min,
                    "priority": o.priority,
                    "qty": o.qty,
                    "operations": [asdict(op) for op in o.operations],
                }
                for o in self.orders
            ],
            "schedule": [asdict(s) for s in self.schedule],
            "events": [asdict(e) for e in self.events],
            "score": self.score,
            "advice_log": self.advice_log,
        }
