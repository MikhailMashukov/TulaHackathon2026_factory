# Весёлый плановик — MVP

Веб-симулятор планирования производства для кейса task3 (Райтек ДТГ) на TulaHack 2026.

## Что внутри

- `spec.md` — спецификация в формате AgentsOS (Стадия 1: Суть+Зачем, 2: Детализация, 3: План, 4: Результат).
- `src/main.py` — FastAPI-сервер с ручками `/api/state`, `/api/tick`, `/api/schedule/replan`, `/api/schedule/move`, `/api/event/random`, `/api/copilot/suggest`.
- `src/scheduler.py` — greedy + EDD планировщик.
- `src/events.py` — 6 типов событий из ТЗ (поломка, supply_delay, qc_recheck, rush_order, no_operator, overload).
- `src/scoring.py` — 5-компонентная формула баллов (on_time, idle, balance, defects, resilience).
- `src/copilot.py` — обёртка над Claude API + canned-fallback из `data/canned_advice.json`.
- `src/static/index.html` + `app.js` — UI с Гантом на vis-timeline, drag-and-drop, кнопки тиков и событий.
- `src/data/sample_orders.json` — 6 машин, 3 типа изделий, 10 заказов.
- `tests/test_scheduler.py` — pytest smoke (нет overlap, последовательность операций соблюдается, score в диапазоне).

## Запуск

```bash
cd /project/TulaHackathon/factory
pip install -r requirements.txt
# опционально: export ANTHROPIC_API_KEY=sk-...
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
# открыть http://localhost:8000/
```

Тесты:
```bash
pytest tests/ -v
```

## Demo-сценарий (на сцене)

1. Открыть страницу — Гант, 10 заказов разложены по станкам.
2. Нажать `+1 час` пару раз — игр.минута растёт.
3. Нажать `Случайное событие` — выпадает поломка/срочный заказ. Копилот сразу предлагает совет.
4. Нажать `Перепланировать` — Гант перерисовывается с учётом блокировки.
5. Drag-and-drop: тяните операцию на другой однотипный станок мышью.
6. Смотрите счёт справа: total = взвешенная сумма (on_time × 0.35 + idle × 0.20 + balance × 0.15 + defects × 0.10 + resilience × 0.20).

## Опциональные этапы (не для MVP)

- **automatic1111**: подключить локальный Stable Diffusion для генерации thumbnail'ов станков/изделий в стиле «industrial steampunk Тула». Заглушка: добавить поле `thumbnail_url` в machines/products и эндпоинт `/api/gen/thumbnail` с обёрткой над `txt2img` API.
- **Лидерборд**: localStorage на клиенте, без сервера.
- **Уровни сложности**: добавить `state.difficulty`, влияющую на частоту событий и кол-во заказов.
- **Тула-стилизация**: пиксельные иконки цеха, шрифт «Iron», копирайт.

## Главные риски и mitigation

- **Claude API недоступен на стенде** → автоматический fallback на canned-ответы из `canned_advice.json` (3+ заскриптованных ответа на demo-сценарии).
- **Утопиться в Ганте** → vis-timeline через CDN, никакого кастомного SVG.
- **Frontend-полировка съест время** → всё в одном HTML+JS файле, Tailwind CDN не используем.
