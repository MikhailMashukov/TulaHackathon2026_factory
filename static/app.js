let timeline = null;
let groups = null;
let items = null;
let lastState = null;
let simSpeed = 1;
let tickerHandle = null;
let lastTimelinePaintMs = 0;

const LABELS = {
  on_time: "В срок",
  idle: "Загрузка",
  balance: "Равномерность",
  defects: "Качество",
  resilience: "Устойчивость",
  total: "ИТОГО",
};

const STATUS_RU = {
  idle: "свободен",
  busy: "работает",
  broken: "поломка",
  no_operator: "нет оператора",
};

const EVENT_TYPE_RU = {
  breakdown: "поломка",
  supply_delay: "задержка поставки",
  qc_recheck: "повторный ОТК",
  rush_order: "срочный заказ",
  no_operator: "нет оператора",
  overload: "перегрузка",
};

const PRODUCT_RU = {
  shaft: "вал",
  sheet_frame: "рамный корпус",
  assembly_unit: "сборочный узел",
  bracket: "кронштейн",
};

const MACHINE_TYPE_RU = {
  lathe: "Токарный",
  cnc_mill: "Фрезер ЧПУ",
  plasma: "Плазморез",
  weld: "Сварочный",
  paint: "Покраска",
  qc: "ОТК",
  pack: "Упаковка",
};

const MACHINE_TYPE_COLOR = {
  lathe: "#4ecdc4",
  cnc_mill: "#3498db",
  plasma: "#9b59b6",
  weld: "#e67e22",
  paint: "#f1c40f",
  qc: "#95a5a6",
  pack: "#2ecc71",
};

const SOFT_OUTPUT_LIMIT = 20;

function machineCardClass(status) {
  if (status === "broken") return "bad";
  if (status === "no_operator") return "warn";
  return "ok";
}

function colorForMaterial(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h}, 65%, 55%)`;
}

function renderMaterialStacks(materialMap) {
  const entries = Object.entries(materialMap).filter(([, qty]) => qty > 0);
  if (!entries.length) return '<div class="machine-meta">пусто</div>';

  return `<div class="stack">${entries
    .map(([material, qty]) => {
      const groups = [];
      let left = qty;
      while (left > 0) {
        groups.push(Math.min(10, left));
        left -= 10;
      }
      const color = colorForMaterial(material);
      const groupHtml = groups
        .map((fill) => `<div class="stack-group" title="${material}: ${fill} / 10">
          ${Array.from({ length: 10 }, (_, i) => `<i class="${i < fill ? "filled" : ""}" style="background:${color};"></i>`).join("")}
        </div>`)
        .join("");
      return `<div>${groupHtml}</div>`;
    })
    .join("")}</div>`;
}

function operationById(state, opId) {
  for (const order of state.orders) {
    const op = order.operations.find((x) => x.id === opId);
    if (op) return { order, op };
  }
  return null;
}

function computeMachineBuffers(state) {
  const now = state.now;
  const scheduleByOp = {};
  for (const s of state.schedule) scheduleByOp[s.op_id] = s;

  const opsByOrder = {};
  for (const o of state.orders) {
    opsByOrder[o.id] = [...o.operations].sort((a, b) => a.seq - b.seq);
  }

  const inputByMachine = {};
  const outputByMachine = {};

  for (const machine of state.machines) {
    inputByMachine[machine.id] = {};
    outputByMachine[machine.id] = {};
  }

  for (const order of state.orders) {
    const qty = order.qty || 10;
    const ops = opsByOrder[order.id] || [];
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const sch = scheduleByOp[op.id];
      if (!sch) continue;

      if (sch.start_min > now) {
        for (const [mat, n] of Object.entries(op.consumes || {})) {
          inputByMachine[sch.machine_id][mat] = (inputByMachine[sch.machine_id][mat] || 0) + n * qty;
        }
      }

      if (sch.end_min <= now) {
        const next = ops[i + 1];
        const nextSch = next ? scheduleByOp[next.id] : null;
        const nextStarted = nextSch ? nextSch.start_min <= now : false;
        if (!nextStarted) {
          for (const [mat, n] of Object.entries(op.produces || {})) {
            outputByMachine[sch.machine_id][mat] = (outputByMachine[sch.machine_id][mat] || 0) + n * qty;
          }
        }
      }
    }
  }

  return { inputByMachine, outputByMachine };
}

function machineDisplayStatus(machine, activeOp, inputMap, outputMap, events) {
  const hardProblem = machine.status === "broken" || machine.status === "no_operator";
  if (hardProblem) return { code: "red", text: STATUS_RU[machine.status] || machine.status };

  const hasTypeOverload = (events || []).some(
    (e) => !e.resolved && e.type === "overload" && e.payload?.machine_type === machine.type
  );
  const outputRisk = Object.values(outputMap || {}).some((x) => x >= SOFT_OUTPUT_LIMIT);
  if (hasTypeOverload || outputRisk) {
    return { code: "yellow", text: hasTypeOverload ? "перегрузка" : "риск задержки" };
  }

  if (activeOp) return { code: "green", text: "в работе" };
  return { code: "white", text: "простой" };
}

function renderMachines(state) {
  const box = document.getElementById("machines-list");
  const scheduleByMachine = {};
  for (const s of state.schedule) {
    scheduleByMachine[s.machine_id] = scheduleByMachine[s.machine_id] || [];
    scheduleByMachine[s.machine_id].push(s);
  }

  const { inputByMachine, outputByMachine } = computeMachineBuffers(state);

  box.innerHTML = state.machines
    .map((m) => {
      const queue = (scheduleByMachine[m.id] || []).filter((s) => s.start_min >= state.now).length;
      const active = (scheduleByMachine[m.id] || []).find((s) => s.start_min <= state.now && s.end_min > state.now);
      const statusInfo = machineDisplayStatus(m, active, inputByMachine[m.id], outputByMachine[m.id], state.events);
      const nameColor = statusInfo.code === "green" ? "#5fbf5f" : statusInfo.code === "yellow" ? "#f1c40f" : statusInfo.code === "red" ? "#ff6b6b" : "#f5f5f5";
      const typeColor = MACHINE_TYPE_COLOR[m.type] || "#777";

      return `<div class="machine-card ${machineCardClass(m.status)}">
        <div class="machine-head">
          <span class="type-dot" style="background:${typeColor}"></span>
          <div class="machine-title" style="color:${nameColor}">${m.name_ru}</div>
        </div>
        <div class="machine-meta-grid">
          <div>${statusInfo.text}</div>
          <div>${active ? active.op_id : "—"}</div>
          <div>очередь:</div>
          <div>${queue} операций</div>
        </div>
        <div class="buffers">
          <div class="buffer">
            <h4>Вход</h4>
            ${renderMaterialStacks(inputByMachine[m.id] || {})}
          </div>
          <div class="buffer">
            <h4>Выход</h4>
            ${renderMaterialStacks(outputByMachine[m.id] || {})}
          </div>
        </div>
      </div>`;
    })
    .join("");
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : null,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

function minToDate(m) {
  return new Date(m * 60 * 1000);
}

function buildGroups(state) {
  return new vis.DataSet(
    state.machines.map((m) => ({
      id: m.id,
      content: `${m.name_ru}<br><small style="color:${m.status === "broken" ? "#c0392b" : m.status === "no_operator" ? "#e67e22" : "#888"}">${STATUS_RU[m.status] || m.status}</small>`,
    }))
  );
}

function buildItems(state) {
  const ordersById = {};
  for (const o of state.orders) ordersById[o.id] = o;

  return new vis.DataSet(
    state.schedule.map((s) => {
      const order_num = s.op_id.split("-")[1];
      const order_id = `ORD-${order_num.padStart(3, "0")}`;
      const o = ordersById[order_id];
      const priority = o ? o.priority : 2;
      return {
        id: s.op_id,
        group: s.machine_id,
        start: minToDate(s.start_min),
        end: minToDate(s.end_min),
        content: `${s.op_id}<br><small>${o ? (PRODUCT_RU[o.product] || o.product) : ""}</small>`,
        className: `priority-${priority}`,
        title: `${s.op_id} | ${o ? (PRODUCT_RU[o.product] || o.product) : ""} | ${s.start_min}–${s.end_min} мин`,
      };
    })
  );
}

function initTimeline(state) {
  groups = buildGroups(state);
  items = buildItems(state);

  const container = document.getElementById("timeline");

  timeline = new vis.Timeline(container, items, groups, {
    stack: false,
    editable: true,
    zoomable: true,
    moveable: true,
    showCurrentTime: false, // оставляем false
    start: minToDate(0),
    end: minToDate(state.horizon_min),
  });

  timeline.addCustomTime(minToDate(state.now), "now");
}

function updateNowLine(state) {
  if (!timeline) return;
  timeline.setCustomTime(minToDate(state.now), "now");
}

function updateTimelineData(state) {
  groups.clear();
  items.clear();

  groups.add(buildGroups(state).get());
  items.add(buildItems(state).get());
}

function refreshTimelineData(state) {
  groups = buildGroups(state);
  items = buildItems(state);
  timeline.setData(items);
  timeline.setGroups(groups);
}

function dataChanged(prev, curr) {
  if (!prev) return true;
  return (
    JSON.stringify(prev.machines) !== JSON.stringify(curr.machines) ||
    JSON.stringify(prev.schedule) !== JSON.stringify(curr.schedule) ||
    JSON.stringify(prev.orders || []) !== JSON.stringify(curr.orders || [])
  );
}

/* ---------------- UPDATE (instead of full rebuild) ---------------- */
function updateGroups(state) {
  const newData = state.machines.map((m) => ({
    id: m.id,
    content: `${m.name_ru}<br><small>${STATUS_RU[m.status] || m.status}</small>`,
  }));
  groups.clear();
  groups.add(newData);
}

function updateItems(state) {
  const ordersById = Object.fromEntries(state.orders.map(o => [o.id, o]));
  const newData = state.schedule.map((s) => {
    const order_num = s.op_id.split("-")[1];
    const order_id = `ORD-${order_num.padStart(3, "0")}`;
    const o = ordersById[order_id];
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

/* ---------------- FAST UPDATE ONLY LINE ---------------- */
function updateNowLine(state) {
  if (!timeline) return;
  timeline.setCustomTime(minToDate(state.now), "now");
}

/* ---------------- RENDER WRAPPER (оптимизированный) ---------------- */
function renderTimeline(state) {
  if (!timeline) {
    initTimeline(state);
    return;
  }

  // 🔥 Полная перерисовка Ганта — ТОЛЬКО если данные изменились
  if (dataChanged(lastState, state)) {
    updateGroups(state);
    updateItems(state);
  }

  // 🔥 Вертикальная линия — всегда и очень быстро
  updateNowLine(state);
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
        <b>${e.id}</b> [${EVENT_TYPE_RU[e.type] || e.type}] @${e.triggered_at}мин<br>${e.description_ru}
      </div>`
    )
    .join("");
}

function orderProgress(order, state) {
  const qty = order.qty || 10;
  const orderOps = [...order.operations].sort((a, b) => a.seq - b.seq);
  const scheduleMap = Object.fromEntries(state.schedule.map((s) => [s.op_id, s]));
  const first = scheduleMap[orderOps[0]?.id];
  const last = scheduleMap[orderOps[orderOps.length - 1]?.id];

  if (last && last.end_min <= state.now) {
    return { ordered: qty, inProgress: 0, ready: qty };
  }
  if (first && first.start_min <= state.now) {
    return { ordered: qty, inProgress: qty, ready: 0 };
  }
  return { ordered: qty, inProgress: 0, ready: 0 };
}

function openOrdersModal() {
  if (!lastState) return;
  const body = document.getElementById("orders-modal-body");
  body.innerHTML = `<table class="table">
    <thead><tr><th>Заказ</th><th>Изделие</th><th>Приоритет</th><th>Дедлайн</th><th>Заказано</th><th>В производстве</th><th>Готово</th></tr></thead>
    <tbody>
      ${lastState.orders
        .map((o) => {
          const p = orderProgress(o, lastState);
          return `<tr>
            <td>${o.id}</td>
            <td>${PRODUCT_RU[o.product] || o.product}</td>
            <td>${o.priority}</td>
            <td>${o.deadline_min}</td>
            <td>${p.ordered}</td>
            <td>${p.inProgress}</td>
            <td>${p.ready}</td>
          </tr>`;
        })
        .join("")}
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
    .map(
      (o) => `<div class="route">
        <b>${o.id}</b> — ${PRODUCT_RU[o.product] || o.product} (qty=${o.qty || 10})
        <div class="route-steps">
          ${[...o.operations]
            .sort((a, b) => a.seq - b.seq)
            .map((op) => {
              const tColor = MACHINE_TYPE_COLOR[op.machine_type] || "#777";
              const tRu = MACHINE_TYPE_RU[op.machine_type] || op.machine_type;
              return `<span class="step-pill">${op.seq}. <span style="color:${tColor}">${tRu}</span> • ${op.duration_min}м • ${stepStatus(op, lastState)}</span>`;
            })
            .join("<span>→</span>")}
        </div>
      </div>`
    )
    .join("");
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
    if (!el) continue;
    el.classList.toggle("active", v === simSpeed);
  }
}

function setSpeed(v) {
  simSpeed = v;
  refreshSpeedButtons();
}

async function refresh() {
  const state = await api("/api/state");

  document.getElementById("now-readout").textContent = state.now;
  document.getElementById("horizon-readout").textContent = state.horizon_min;
  renderMachines(state);
  renderTimeline(state);     // ← теперь использует lastState как "предыдущее состояние"
  renderScore(state.score);
  renderEvents(state.events);

  lastState = state;         // ← важно: ставим В КОНЦЕ, чтобы в renderTimeline был доступ к старому состоянию
}

async function tick(minutes) {
  await api("/api/tick", { method: "POST", body: { minutes } });
}

async function loopTick() {
  if (!lastState || simSpeed <= 0) return;
  try {
    await tick(simSpeed);
    await refresh();
  } catch (e) {
    console.error(e);
    setSpeed(0);
  }
}

async function doReplan() {
  await api("/api/schedule/replan", { method: "POST" });
  await refresh();
}

async function randomEvent() {
  const r = await api("/api/event/random", { method: "POST", body: {} });
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
  await api("/api/reset", { method: "POST" });
  setSpeed(1);
  await refresh();
  document.getElementById("advice-box").textContent = "Состояние сброшено.";
}

async function init() {
  await refresh();
  setSpeed(1);
  tickerHandle = setInterval(loopTick, 1000);
}

init();
