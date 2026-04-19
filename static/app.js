// app.js
import {
  GAME_START_UTC,
  LABELS,
  STATUS_RU,
  EVENT_TYPE_RU,
  PRODUCT_RU,
  MACHINE_TYPE_RU,
  MACHINE_TYPE_COLOR,
  MACHINE_TYPE_ICON,
  SOFT_OUTPUT_LIMIT,
  applyDayNightTheme,
  machineCardClass,
  colorForMaterial,
  renderMaterialStacks,
  operationById,
  computeMachineBuffers,
  machineDisplayStatus,
  minToDate,
  formatGameTime,
  buildGroups,
  buildItems,
} from './config_and_helpers.js';

let timeline = null;
let groups = null;
let items = null;
let lastState = null;
let simSpeed = 1;
let tickIntervalHandle = null;

let localState = null;
let useClientSimulation = true;

const api = async (path, opts = {}) => {
  const res = await fetch(path, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : null,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
};

/* ===================== CLIENT SIMULATION ===================== */
function generateRandomEvent(state) {
  const types = Object.keys(EVENT_TYPE_RU);
  const type = types[Math.floor(Math.random() * types.length)];
  const machine = state.machines[Math.floor(Math.random() * state.machines.length)];

  const descriptions = {
    breakdown: `Поломка оборудования на участке «${machine.name_ru}»`,
    supply_delay: "Задержка поставки сырья с поставщика",
    qc_recheck: "Требуется повторный контроль ОТК",
    rush_order: "Поступил срочный приоритетный заказ",
    no_operator: `Отсутствует оператор на ${machine.name_ru}`,
    overload: `Перегрузка участка ${MACHINE_TYPE_RU[machine.type] || machine.type}`,
  };

  return {
    id: "EVT-" + Math.random().toString(36).substring(2, 9).toUpperCase(),
    type,
    triggered_at: state.now,
    description_ru: descriptions[type] || "Неизвестное событие",
    resolved: false,
    payload: type === "overload" ? { machine_type: machine.type } : {},
  };
}

function applyEventEffect(state, event) {
  if (event.resolved) return;
  switch (event.type) {
    case "breakdown":
    case "no_operator":
      if (state.machines.length) {
        const idx = Math.floor(Math.random() * state.machines.length);
        state.machines[idx].status = event.type === "breakdown" ? "broken" : "no_operator";
      }
      break;
  }
}

function autoResolveLocalEvents(state) {
  const ttlByType = {
    breakdown: 40,
    no_operator: 30,
    supply_delay: 45,
    qc_recheck: 20,
    rush_order: 25,
    overload: 20,
  };

  for (const e of state.events || []) {
    if (e.resolved) continue;
    const ttl = ttlByType[e.type] ?? 30;
    if (state.now - e.triggered_at >= ttl) e.resolved = true;
  }
}

function calculateScore(state) {
  const totalOrders = state.orders?.length || 0;
  const completed = state.orders?.filter(o => {
    const lastOp = o.operations?.[o.operations.length - 1];
    const sch = lastOp && state.schedule.find(s => s.op_id === lastOp.id);
    return sch && sch.end_min <= state.now;
  }).length || 0;

  const onTime = totalOrders ? Math.floor((completed / totalOrders) * 100) : 65;
  const idle = 85;
  const balance = 82;
  const defects = Math.max(70, 95 - (state.events?.filter(e => !e.resolved).length || 0) * 8);
  const resilience = state.events?.filter(e => !e.resolved).length < 3 ? 88 : 45;

  const s = {
    on_time: onTime,
    idle: idle,
    balance: balance,
    defects: defects,
    resilience: resilience,
    weights: { on_time: 1.3, idle: 1, balance: 1, defects: 1, resilience: 0.9 },
  };

  s.total = Math.round(
    s.on_time * s.weights.on_time +
    s.idle * s.weights.idle +
    s.balance * s.weights.balance +
    s.defects * s.weights.defects +
    s.resilience * s.weights.resilience
  );
  return s;
}

function simulateTick(minutes) {
  if (!localState) return;
  localState.now += minutes;
  if (localState.now > localState.horizon_min) localState.now = localState.horizon_min;

  localState.schedule.forEach(s => {
    if (s.end_min <= localState.now) s.completed = true;
  });

  if (Math.random() < 0.18 * (minutes / 5)) {
    const event = generateRandomEvent(localState);
    localState.events.unshift(event);
    applyEventEffect(localState, event);
  }

  localState.machines.forEach(m => {
    if (m.status === "broken" && Math.random() < 0.12) m.status = "idle";
    if (m.status === "no_operator" && Math.random() < 0.35) m.status = "idle";
  });

  autoResolveLocalEvents(localState);
  localState.score = calculateScore(localState);
}

function syncLocalState(serverState) {
  if (!useClientSimulation || !serverState) return;
  localState = JSON.parse(JSON.stringify(serverState));
}

/* ===================== RENDER ===================== */
function dataChanged(prev, curr) {
  if (!prev) return true;
  return (
    JSON.stringify(prev.machines) !== JSON.stringify(curr.machines) ||
    JSON.stringify(prev.schedule) !== JSON.stringify(curr.schedule) ||
    JSON.stringify(prev.orders || []) !== JSON.stringify(curr.orders || [])
  );
}

function updateGroups(state) {
  const newData = state.machines.map((m) => ({
    id: m.id,
    content: `${m.name_ru}<br><small>${STATUS_RU[m.status] || m.status}</small>`,
  }));
  groups.clear();
  groups.add(newData);
}

function updateItems(state) {
  const orderByOpId = {};
  for (const order of state.orders) {
    for (const op of order.operations || []) orderByOpId[op.id] = order;
  }
  const newData = state.schedule.map((s) => {
    const o = orderByOpId[s.op_id];
    return {
      id: s.op_id,
      group: s.machine_id,
      start: minToDate(s.start_min),
      end: minToDate(s.end_min),
      content: `${s.op_id}<br><small>${o ? (PRODUCT_RU[o.product] || o.product) : ""}</small>`,
    };
  });
  items.clear();
  items.add(newData);
}

function updateNowLine(state) {
  if (!timeline) return;
  timeline.setCustomTime(minToDate(state.now), "now");
}

function renderTimeline(state) {
  if (!timeline) {
    groups = buildGroups(state);
    items = buildItems(state);
    const container = document.getElementById("timeline");
    timeline = new vis.Timeline(container, items, groups, {
      stack: false,
      editable: true,
      zoomable: true,
      moveable: true,
      showCurrentTime: false,
      start: minToDate(0),
      end: minToDate(state.horizon_min),
    });
    timeline.addCustomTime(minToDate(state.now), "now");
    return;
  }

  if (dataChanged(lastState, state)) {
    updateGroups(state);
    updateItems(state);
  }
  updateNowLine(state);
}

function renderMachines(state) {
  const box = document.getElementById("machines-list");
  const scheduleByMachine = {};
  for (const s of state.schedule) {
    scheduleByMachine[s.machine_id] = scheduleByMachine[s.machine_id] || [];
    scheduleByMachine[s.machine_id].push(s);
  }

  const orderByOpId = {};
  for (const order of state.orders) {
    for (const op of order.operations || []) {
      orderByOpId[op.id] = order;
    }
  }

  const { inputByMachine, outputByMachine } = computeMachineBuffers(state);

  box.innerHTML = state.machines
    .map((m) => {
      const queuedOps = (scheduleByMachine[m.id] || []).filter((s) => s.start_min >= state.now);
      const queue = queuedOps.length;
      const queuedOrders = new Set(queuedOps.map((s) => orderByOpId[s.op_id]?.id).filter(Boolean));
      const active = (scheduleByMachine[m.id] || []).find((s) => s.start_min <= state.now && s.end_min > state.now);
      const statusInfo = machineDisplayStatus(m, active, inputByMachine[m.id], outputByMachine[m.id], state.events);
      const activeOrder = active ? orderByOpId[active.op_id] : null;

      const nameColor = statusInfo.code === "green" ? "#5fbf5f" 
                     : statusInfo.code === "yellow" ? "#f1c40f" 
                     : statusInfo.code === "red" ? "#ff6b6b" 
                     : "#f5f5f5";

      const typeColor = MACHINE_TYPE_COLOR[m.type] || "#777";
      const typeRu = MACHINE_TYPE_RU[m.type] || m.type;
      const typeIcon = MACHINE_TYPE_ICON[m.type] || "⚙️";

      return `<div class="machine-card ${machineCardClass(m.status)}">
        <div class="machine-head">
          <span class="type-dot" style="background:${typeColor}"></span>
          <div class="machine-title" style="color:${nameColor}">${m.name_ru}</div>
        </div>
        <div class="machine-layout">
          <div class="buffer">
            <h4>Вход</h4>
            ${renderMaterialStacks(inputByMachine[m.id] || {})}
          </div>
          <div class="machine-center">
            <div class="machine-icon" title="${typeRu}">${typeIcon}</div>
            <div class="machine-kind">${typeRu}</div>
          </div>
          <div class="machine-meta-grid">
            <div class="meta-label">статус</div>
            <div>${statusInfo.text}</div>
            <div class="meta-label">операция</div>
            <div>${active ? active.op_id : "—"}</div>
            <div class="meta-label">заказ</div>
            <div>${activeOrder ? activeOrder.id : "—"}</div>
            <div class="meta-label">очередь</div>
            <div>${queue} оп / ${queuedOrders.size} парт.</div>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

function renderScore(score) {
  const grid = document.getElementById("score-grid");
  grid.innerHTML = "";
  for (const k of ["on_time", "idle", "balance", "defects", "resilience"]) {
    const w = score.weights ? score.weights[k] : 0;
    grid.innerHTML += `<div class="label">${LABELS[k]} (×${w})</div><div>${score[k]}</div>`;
  }
  grid.innerHTML += `<div class="label total">${LABELS.total}</div><div class="total">${score.total}</div>`;
}

function renderEvents(events) {
  const box = document.getElementById("events-list");
  if (!events.length) {
    box.textContent = "Пока нет";
    return;
  }
  box.innerHTML = events
    .slice()
    .reverse()
    .map(
      (e) => `<div class="event-item ${e.resolved ? "resolved" : ""}">
        <b>${e.id}</b> [${EVENT_TYPE_RU[e.type] || e.type}] @${formatGameTime(e.triggered_at)}<br>${e.description_ru}
      </div>`
    )
    .join("");
}

/* ===================== MODALS ===================== */
function orderProgress(order, state) {
  const qty = order.qty || 10;
  const orderOps = [...order.operations].sort((a, b) => a.seq - b.seq);
  const scheduleMap = Object.fromEntries(state.schedule.map((s) => [s.op_id, s]));
  const first = scheduleMap[orderOps[0]?.id];
  const last = scheduleMap[orderOps[orderOps.length - 1]?.id];

  if (last && last.end_min <= state.now) return { ordered: qty, inProgress: 0, ready: qty };
  if (first && first.start_min <= state.now) return { ordered: qty, inProgress: qty, ready: 0 };
  return { ordered: qty, inProgress: 0, ready: 0 };
}

function openOrdersModal() {
  if (!lastState) return;
  const body = document.getElementById("orders-modal-body");
  body.innerHTML = `<table class="table">
    <thead><tr><th>Заказ</th><th>Изделие</th><th>Приоритет</th><th>Дедлайн</th><th>Заказано</th><th>В производстве</th><th>Готово</th></tr></thead>
    <tbody>
      ${lastState.orders.map((o) => {
        const p = orderProgress(o, lastState);
        return `<tr>
          <td>${o.id}</td>
          <td>${PRODUCT_RU[o.product] || o.product}</td>
          <td>${o.priority}</td>
          <td>${formatGameTime(o.deadline_min)}</td>
          <td>${p.ordered}</td>
          <td>${p.inProgress}</td>
          <td>${p.ready}</td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>`;
  document.getElementById("orders-modal").classList.add("open");
}

function stepStatus(op, state) {
  const s = state.schedule.find((x) => x.op_id === op.id);
  if (!s) return "нет в плане";
  if (s.end_min <= state.now) return "выполнен";
  if (s.start_min <= state.now) return "в работе";
  return "ожидает";
}

function openRoutesModal() {
  if (!lastState) return;
  const body = document.getElementById("routes-modal-body");
  body.innerHTML = lastState.orders
    .map((o) => `<div class="route">
      <b>${o.id}</b> — ${PRODUCT_RU[o.product] || o.product} (qty=${o.qty || 10})
      <div class="route-steps">
        ${[...o.operations].sort((a, b) => a.seq - b.seq)
          .map((op) => {
            const tColor = MACHINE_TYPE_COLOR[op.machine_type] || "#777";
            const tRu = MACHINE_TYPE_RU[op.machine_type] || op.machine_type;
            return `<span class="step-pill">${op.seq}. <span style="color:${tColor}">${tRu}</span> • ${op.duration_min}м • ${stepStatus(op, lastState)}</span>`;
          }).join("<span>→</span>")}
      </div>
    </div>`).join("");
  document.getElementById("routes-modal").classList.add("open");
}

function closeModal(e, id) {
  if (e.target.id === id) closeModalById(id);
}
function closeModalById(id) {
  document.getElementById(id).classList.remove("open");
}

function refreshSpeedButtons() {
  for (const v of [0, 1, 4, 20]) {
    const el = document.getElementById(`speed-${v}`);
    if (el) el.classList.toggle("active", v === simSpeed);
  }
}

function setSpeed(v) {
  simSpeed = v;
  refreshSpeedButtons();
  restartTickTimer();
}

/* ===================== MAIN ===================== */
async function refresh() {
  let state;
  if (useClientSimulation && localState) {
    state = localState;
  } else {
    state = await api("/api/state");
  }

  applyDayNightTheme(state.now);
  document.getElementById("now-readout").textContent = formatGameTime(state.now);
  document.getElementById("horizon-readout").textContent = formatGameTime(state.now);

  renderMachines(state);
  renderTimeline(state);
  renderScore(state.score);
  renderEvents(state.events);

  lastState = state;
}

function timingBySpeed(speed) {
  if (speed <= 0) return null;
  if (speed === 1) return { intervalMs: 1000, gameMinutes: 1 };
  if (speed === 4) return { intervalMs: 500, gameMinutes: 2 };
  if (speed === 20) return { intervalMs: 200, gameMinutes: 4 };
  return { intervalMs: 1000, gameMinutes: speed };
}

function restartTickTimer() {
  const t = timingBySpeed(simSpeed);
  if (tickIntervalHandle) {
    clearInterval(tickIntervalHandle);
    tickIntervalHandle = null;
  }
  if (!t) return;
  tickIntervalHandle = setInterval(() => {
    loopTick(t.gameMinutes);
  }, t.intervalMs);
}

async function loopTick(gameMinutes) {
  if (simSpeed <= 0) return;
  if (!lastState && !localState) return;
  try {
    if (useClientSimulation) {
      simulateTick(gameMinutes);
    } else {
      await api("/api/tick", { method: "POST", body: { minutes: gameMinutes } });
    }
    await refresh();
  } catch (e) {
    console.error(e);
    setSpeed(0);
  }
}

async function doReplan() {
  const serverState = await api("/api/schedule/replan", { method: "POST" });
  syncLocalState(serverState);
  await refresh();
}

async function randomEvent() {
  const r = await api("/api/event/random", { method: "POST", body: {} });
  syncLocalState(r.state);
  await refresh();
  setTimeout(() => askCopilot(r.event.id), 200);
}

async function askCopilot(eventId) {
  const body = eventId ? { event_id: eventId } : {};
  const res = await api("/api/copilot/suggest", { method: "POST", body });
  document.getElementById("advice-box").innerHTML =
    `<div class="advice">${res.advice_ru}<div class="src">источник: ${res.source}</div></div>`;
}

async function reset() {
  const serverState = await api("/api/reset", { method: "POST" });
  syncLocalState(serverState);
  setSpeed(1);
  await refresh();
  document.getElementById("advice-box").textContent = "Состояние сброшено.";
}

async function init() {
  if (useClientSimulation) {
    const serverInit = await api("/api/state");
    localState = JSON.parse(JSON.stringify(serverInit));
  }

  window.setSpeed = setSpeed;
  window.doReplan = doReplan;
  window.randomEvent = randomEvent;
  window.askCopilot = askCopilot;
  window.reset = reset;
  window.openOrdersModal = openOrdersModal;
  window.openRoutesModal = openRoutesModal;
  window.closeModal = closeModal;
  window.closeModalById = closeModalById;

  await refresh();
  setSpeed(1);
}

init();
