export const GAME_START_UTC = Date.UTC(2026, 4, 1, 0, 0, 0); // 1 мая 2026

export const LABELS = {
  on_time: "В срок",
  idle: "Загрузка",
  balance: "Равномерность",
  defects: "Качество",
  resilience: "Устойчивость",
  total: "ИТОГО",
};

export const STATUS_RU = {
  idle: "свободен",
  busy: "работает",
  broken: "поломка",
  no_operator: "нет оператора",
};

export const EVENT_TYPE_RU = {
  breakdown: "поломка",
  supply_delay: "задержка поставки",
  qc_recheck: "повторный ОТК",
  rush_order: "срочный заказ",
  no_operator: "нет оператора",
  overload: "перегрузка",
};

export const PRODUCT_RU = {
  fan: "вентилятор",
  lamp: "лампа",
  plastic_cap: "пластиковая крышка",
};

export const MACHINE_TYPE_RU = {
  plastic_press: "Пресс-пласт",
  trim: "Доводка",
  assembly: "Сборка",
  qc_pack: "ОТК+Упаковка",
};

export const MACHINE_TYPE_COLOR = {
  plastic_press: "#4ecdc4",
  trim: "#3498db",
  assembly: "#e67e22",
  qc_pack: "#95a5a6",
};

export const MACHINE_TYPE_ICON = {
  plastic_press: "🧱",
  trim: "✂️",
  assembly: "🛠️",
  qc_pack: "📦",
};

export const SOFT_OUTPUT_LIMIT = 20;

export function applyDayNightTheme(nowMin) {
  const dayPos = ((nowMin % 1440) + 1440) % 1440;
  const t = dayPos / 1440;
  const light = Math.max(0, Math.sin((t - 0.25) * Math.PI * 2));

  const topL = Math.round(12 + light * 32);
  const bottomL = Math.round(16 + light * 30);
  const panel1L = Math.round(14 + light * 18);
  const panel2L = Math.round(18 + light * 18);
  const panel3L = Math.round(20 + light * 18);
  const panel4L = Math.round(16 + light * 18);

  const root = document.documentElement.style;
  root.setProperty("--bg-top", `hsl(220 40% ${topL}%)`);
  root.setProperty("--bg-bottom", `hsl(210 35% ${bottomL}%)`);
  root.setProperty("--panel-1", `hsl(220 10% ${panel1L}%)`);
  root.setProperty("--panel-2", `hsl(220 10% ${panel2L}%)`);
  root.setProperty("--panel-3", `hsl(220 10% ${panel3L}%)`);
  root.setProperty("--panel-4", `hsl(220 10% ${panel4L}%)`);
  root.setProperty("--border", `hsl(220 8% ${Math.round(25 + light * 18)}%)`);
  root.setProperty("--text", light > 0.5 ? "#f3f4f6" : "#e8e8e8");
  root.setProperty("--muted", light > 0.5 ? "#cbd5e1" : "#aaa");
}

export function machineCardClass(status) {
  if (status === "broken") return "bad";
  if (status === "no_operator") return "warn";
  return "ok";
}

export function colorForMaterial(name) {
  if (name.startsWith("supplier_")) return "#4f8cff";
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) % 360;
  }
  return `hsl(${h}, 65%, 55%)`;
}

export function renderMaterialStacks(materialMap) {
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

export function operationById(state, opId) {
  for (const order of state.orders) {
    const op = order.operations.find((x) => x.id === opId);
    if (op) return { order, op };
  }
  return null;
}

export function computeMachineBuffers(state) {
  const now = state.now;
  const scheduleByOp = {};
  for (const s of state.schedule) scheduleByOp[s.op_id] = s;

  const opById = {};
  for (const order of state.orders) {
    for (const op of order.operations || []) {
      opById[op.id] = op;
    }
  }

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
          if (mat.startsWith("supplier_")) continue;
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

  // Поставки от поставщиков (визуально)
  const supplierSetByMachine = {};
  for (const s of state.schedule) {
    const op = opById[s.op_id];
    if (!op) continue;
    const supplierMats = Object.keys(op.consumes || {}).filter((mat) => mat.startsWith("supplier_"));
    if (!supplierMats.length) continue;
    supplierSetByMachine[s.machine_id] = supplierSetByMachine[s.machine_id] || new Set();
    for (const mat of supplierMats) supplierSetByMachine[s.machine_id].add(mat);
  }

  for (const machine of state.machines) {
    const supplierMats = supplierSetByMachine[machine.id] || new Set();
    for (const mat of supplierMats) {
      inputByMachine[machine.id][mat] = 10;
    }

    const active = (state.schedule || []).find((s) => s.machine_id === machine.id && s.start_min <= now && s.end_min > now);
    if (!active) continue;
    const activeOp = opById[active.op_id];
    if (!activeOp) continue;
    const sinceStart = now - active.start_min;
    if (sinceStart < 0 || sinceStart > 2) continue;

    for (const [mat, need] of Object.entries(activeOp.consumes || {})) {
      if (!mat.startsWith("supplier_")) continue;
      const current = inputByMachine[machine.id][mat] ?? 10;
      inputByMachine[machine.id][mat] = Math.max(0, current - need);
    }
  }

  return { inputByMachine, outputByMachine };
}

export function machineDisplayStatus(machine, activeOp, inputMap, outputMap, events) {
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

export function minToDate(m) {
  return new Date(GAME_START_UTC + m * 60 * 1000);
}

export function formatGameTime(min) {
  const d = minToDate(min);
  const day = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day} мая ${hh}:${mm}`;
}

export function buildGroups(state) {
  return new vis.DataSet(
    state.machines.map((m) => ({
      id: m.id,
      content: `${m.name_ru}<br><small style="color:${m.status === "broken" ? "#c0392b" : m.status === "no_operator" ? "#e67e22" : "#888"}">${STATUS_RU[m.status] || m.status}</small>`,
    }))
  );
}

export function buildItems(state) {
  const orderByOpId = {};
  for (const order of state.orders) {
    for (const op of order.operations || []) {
      orderByOpId[op.id] = order;
    }
  }

  return new vis.DataSet(
    state.schedule.map((s) => {
      const o = orderByOpId[s.op_id];
      const priority = o ? o.priority : 2;
      return {
        id: s.op_id,
        group: s.machine_id,
        start: minToDate(s.start_min),
        end: minToDate(s.end_min),
        content: `${s.op_id}<br><small>${o ? (PRODUCT_RU[o.product] || o.product) : ""}</small>`,
        className: `priority-${priority}`,
        title: `${s.op_id} | ${o ? (PRODUCT_RU[o.product] || o.product) : ""} | ${formatGameTime(s.start_min)}–${formatGameTime(s.end_min)}`,
      };
    })
  );
}