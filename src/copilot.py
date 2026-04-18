from __future__ import annotations
import json
import os
from pathlib import Path
from typing import Optional
from .models import GameState, Event

CANNED_PATH = Path(__file__).parent / "data" / "canned_advice.json"
_canned: Optional[dict] = None


def _load_canned() -> dict:
    global _canned
    if _canned is None:
        with open(CANNED_PATH, encoding="utf-8") as f:
            _canned = json.load(f)
    return _canned


def _summarize_state(state: GameState, event: Optional[Event]) -> str:
    lines = [f"Сейчас: минута {state.now}, заказов {len(state.orders)}, станков {len(state.machines)}."]
    if event:
        lines.append(f"Событие: {event.description_ru}")
    broken = [m for m in state.machines if m.status in ("broken", "no_operator")]
    if broken:
        lines.append("Заблокированы: " + ", ".join(f"{m.name_ru} ({m.status})" for m in broken))
    late_orders = []
    for o in state.orders:
        ops = [s for s in state.schedule if any(op.id == s.op_id for op in o.operations)]
        if ops and max(s.end_min for s in ops) > o.deadline_min:
            late_orders.append(o.id)
    if late_orders:
        lines.append("Опаздывают по плану: " + ", ".join(late_orders))
    return "\n".join(lines)


def _claude_suggest(prompt: str) -> Optional[str]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    try:
        from anthropic import Anthropic  # noqa
    except ImportError:
        return None
    try:
        client = Anthropic(api_key=api_key)
        msg = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=400,
            system=(
                "Ты — AI-копилот плановика производства (как Ai2B от Райтек ДТГ). "
                "Отвечай по-русски, кратко (3-5 предложений). Давай конкретный совет: "
                "какую операцию куда перенести, что произойдёт со временем и баллом. "
                "Не выдумывай данные, опирайся на снепшот."
            ),
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text if msg.content else None
    except Exception as e:
        return f"[Claude error: {e}]"


def suggest(state: GameState, event: Optional[Event] = None, free_text: Optional[str] = None) -> dict:
    summary = _summarize_state(state, event)
    user_prompt = summary + (f"\n\nВопрос плановика: {free_text}" if free_text else "")

    text = _claude_suggest(user_prompt)
    if text and not text.startswith("[Claude error"):
        return {"advice_ru": text, "source": "claude", "suggested_moves": []}

    canned = _load_canned()
    key = (event.type if event else "default")
    fallback = canned.get(key, canned["default"])
    return {
        "advice_ru": fallback["advice_ru"],
        "source": "canned" + (f" ({text})" if text and text.startswith("[Claude error") else ""),
        "suggested_moves": fallback.get("suggested_moves", []),
    }
