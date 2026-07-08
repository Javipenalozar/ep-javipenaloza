const levelSchedule = [
  { key: "nivel1", name: "Nivel 1 Valioso", unlock: "2026-07-06T00:00:00-05:00", label: "6 Jul" },
  { key: "nivel2", name: "Nivel 2 Valiente I", unlock: "2026-08-10T00:00:00-05:00", label: "10 Ago" },
  { key: "nivel3", name: "Nivel 3 Valiente II", unlock: "2026-08-31T00:00:00-05:00", label: "31 Ago" },
  { key: "nivel4", name: "Nivel 4 Poderoso", unlock: "2026-09-14T00:00:00-05:00", label: "14 Sep" },
  { key: "confianza", name: "Noche de confianza", unlock: "2026-09-25T00:00:00-05:00", label: "25 Sep" },
  { key: "nivel5", name: "Nivel 5 Supervivencia", unlock: "2026-10-19T00:00:00-05:00", label: "19 Oct" },
];

const programStart = new Date("2026-07-06T00:00:00-05:00");
const programWeeks = Array.from({ length: 16 }, (_, index) => ({
  label: `Semana ${index + 1}`,
  startsAt: new Date(programStart.getTime() + index * 7 * 24 * 60 * 60 * 1000),
}));

const miniTeamChecks = [
  { key: "indicadores", label: "Indicadores semanales" },
  { key: "carta", label: "Carta de logros" },
  { key: "reflexion", label: "Reflexión del nivel" },
  { key: "actividades", label: "Actividades pendientes" },
  { key: "tickets", label: "Tickets de transición" },
];

let state = {
  metrics: {},
  metricRecords: [],
  checks: {},
  serverProgress: {
    completedKeys: [],
    currentPercent: 0,
    nextKey: "nivel1",
    serverNow: null,
  },
  letter: {},
  letterVersions: [],
  evidence: {},
  reflections: {},
  approvals: {},
};

async function initPortal() {
  await loadStateFromSupabase();
  hydrateMetrics();
  hydrateChecks();
  applyLevelUnlocks();
  applyMilestoneMessages();
  hydrateLetter();
  hydrateEvidence();
  hydrateReflection();
  hydrateAdmin();
  document.querySelector("#achievementForm").addEventListener("input", updateLetterSummary);
  updateOverall();
  await initTickets();
  await renderPendingActivities();
  await hydrateSupport();
  await hydrateResourceTools();
  await hydrateMiniTeam();
}

async function loadStateFromSupabase() {
  const userId = currentUser.id;

  const [metricsRes, letterRes, evidenceRes, reflectionsRes, progressRes] = await Promise.all([
    sb.from("metrics").select("metric_key, value").eq("user_id", userId),
    sb.from("letters").select("data").eq("user_id", userId).maybeSingle(),
    sb.from("evidence").select("week, weekly_win, weekly_learning, weekly_challenge").eq("user_id", userId),
    sb.from("reflections").select("level_key, takeaway, key_moment, decision, staff_evidence, approval_status").eq("user_id", userId),
    sb.rpc("get_level_progress"),
  ]);

  const metricRecordsRes = await sb.from("metric_records")
    .select("week, identidad, emociones, retos, servicio, overall, note, created_at, updated_at")
    .eq("user_id", userId)
    .order("week", { ascending: true });

  state.metrics = {};
  (metricsRes.data || []).forEach((m) => { state.metrics[m.metric_key] = m.value; });

  state.metricRecords = metricRecordsRes.data || [];

  state.serverProgress = normalizeServerProgress(progressRes.data);
  state.checks = {};
  state.serverProgress.completedKeys.forEach((key) => { state.checks[key] = true; });

  state.letter = letterRes.data?.data || {};

  const letterVersionsRes = await sb.from("letter_versions")
    .select("id, data, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  state.letterVersions = letterVersionsRes.error ? [] : (letterVersionsRes.data || []);

  state.evidence = {};
  (evidenceRes.data || []).forEach((e) => {
    state.evidence[e.week] = {
      weeklyWin: e.weekly_win || "",
      weeklyLearning: e.weekly_learning || "",
      weeklyChallenge: e.weekly_challenge || "",
    };
  });

  state.reflections = {};
  state.approvals = {};
  (reflectionsRes.data || []).forEach((r) => {
    state.reflections[r.level_key] = {
      takeaway: r.takeaway || "",
      keyMoment: r.key_moment || "",
      decision: r.decision || "",
      staffEvidence: r.staff_evidence || "",
    };
    state.approvals[r.level_key] = r.approval_status || "pendiente";
  });
}

function normalizeServerProgress(progress) {
  if (progress && typeof progress === "object" && !Array.isArray(progress)) {
    return {
      completedKeys: progress.completed_keys || [],
      currentPercent: Number(progress.current_percent || 0),
      nextKey: progress.next_key || null,
      serverNow: progress.server_now || null,
    };
  }

  const now = new Date();
  const completedKeys = levelSchedule
    .filter((level) => now >= new Date(level.unlock))
    .map((level) => level.key);

  return {
    completedKeys,
    currentPercent: completedKeys.length * 4,
    nextKey: levelSchedule.find((level) => !completedKeys.includes(level.key))?.key || null,
    serverNow: now.toISOString(),
  };
}

function updateOverall() {
  const ranges = [...document.querySelectorAll(".metric-card input[type='range']")];
  const metricAverage = ranges.reduce((sum, range) => sum + Number(range.value), 0) / ranges.length;
  const checks = [...document.querySelectorAll("[data-check]")];
  const checkAverage = (checks.filter((c) => c.checked).length / checks.length) * 100;
  const overall = Math.round(metricAverage * 0.7 + checkAverage * 0.3);
  document.querySelector("#overallScore").textContent = `${overall}%`;
  document.querySelector("#overallBar").style.width = `${overall}%`;
  const completedCount = state.serverProgress.completedKeys.length;
  document.querySelector("#completedLevels").textContent = `${completedCount}/${checks.length}`;
  updateMetricWeeklyAverage();
}

function hydrateMetrics() {
  const metricWeek = document.querySelector("#metricWeekSelect");
  const saveMetric = document.querySelector("#saveMetricRecord");

  document.querySelectorAll(".metric-card").forEach((card) => {
    const key = card.dataset.metric;
    const range = card.querySelector("input");
    const value = card.querySelector("[data-value]");
    range.value = state.metrics[key] ?? range.value;
    value.textContent = `${range.value}%`;

    range.addEventListener("input", () => {
      value.textContent = `${range.value}%`;
      state.metrics[key] = Number(range.value);
      updateOverall();
    });

    range.addEventListener("change", () => {
      sb.from("metrics").upsert({
        user_id: currentUser.id,
        metric_key: key,
        value: Number(range.value),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,metric_key" });
    });
  });

  if (metricWeek) {
    hydrateMetricWeekOptions();
    metricWeek.addEventListener("change", renderMetricWeek);
    metricWeek.value = getActiveMetricWeek()?.label || "Semana 1";
  }

  if (saveMetric) saveMetric.addEventListener("click", saveMetricRecord);

  renderMetricWeek();
  renderMetricHistory();
}

function getMetricInputs() {
  const inputs = {};
  document.querySelectorAll(".metric-card").forEach((card) => {
    inputs[card.dataset.metric] = card.querySelector("input");
  });
  return inputs;
}

function getCurrentMetricValues() {
  const inputs = getMetricInputs();
  return {
    identidad: Number(inputs.identidad?.value || 0),
    emociones: Number(inputs.emociones?.value || 0),
    retos: Number(inputs.retos?.value || 0),
    servicio: Number(inputs.servicio?.value || 0),
  };
}

function getMetricAverage(values = getCurrentMetricValues()) {
  return Math.round((values.identidad + values.emociones + values.retos + values.servicio) / 4);
}

function updateMetricWeeklyAverage() {
  const averageEl = document.querySelector("#metricWeeklyAverage");
  if (averageEl) averageEl.textContent = `${getMetricAverage()}%`;
}

function getServerNow() {
  return new Date(state.serverProgress.serverNow || new Date().toISOString());
}

function getActiveMetricWeek() {
  const now = getServerNow();
  return programWeeks.find((week) => {
    const endsAt = new Date(week.startsAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    return now >= week.startsAt && now < endsAt;
  }) || programWeeks[0];
}

function hydrateMetricWeekOptions() {
  const metricWeek = document.querySelector("#metricWeekSelect");
  if (!metricWeek) return;

  const now = getServerNow();
  [...metricWeek.options].forEach((option) => {
    const week = programWeeks.find((item) => item.label === option.value);
    option.disabled = week ? now < week.startsAt : true;
  });
}

function renderMetricWeek() {
  const week = document.querySelector("#metricWeekSelect")?.value;
  if (!week) return;

  const record = state.metricRecords.find((item) => item.week === week);
  const inputs = getMetricInputs();
  const saveMetric = document.querySelector("#saveMetricRecord");
  const status = document.querySelector("#metricWeekStatus");
  const activeWeek = getActiveMetricWeek()?.label;
  const selectedWeek = programWeeks.find((item) => item.label === week);
  const isFuture = selectedWeek ? getServerNow() < selectedWeek.startsAt : false;
  const isActive = week === activeWeek;

  if (record) {
    Object.entries(inputs).forEach(([key, input]) => {
      input.value = record[key] ?? input.value;
      input.disabled = true;
      const value = input.closest(".metric-card").querySelector("[data-value]");
      value.textContent = `${input.value}%`;
    });
    document.querySelector("#metricNote").value = record.note || "";
    document.querySelector("#metricNote").disabled = true;
  } else {
    Object.entries(inputs).forEach(([key, input]) => {
      input.value = state.metrics[key] ?? input.value;
      input.disabled = !isActive;
      const value = input.closest(".metric-card").querySelector("[data-value]");
      value.textContent = `${input.value}%`;
    });
    document.querySelector("#metricNote").value = "";
    document.querySelector("#metricNote").disabled = !isActive;
  }

  if (saveMetric) saveMetric.disabled = Boolean(record) || !isActive || isFuture;
  if (status) {
    if (record) status.textContent = "Esta semana ya fue registrada. El record queda cerrado para conservar tu primera medicion.";
    else if (isFuture) status.textContent = "Esta semana todavia no esta disponible.";
    else if (!isActive) status.textContent = "Solo puedes registrar la semana activa. Cada semana abre el lunes a las 00:00.";
    else status.textContent = "Semana activa: puedes guardar una sola vez hasta que abra la siguiente semana.";
  }

  updateOverall();
}

async function saveMetricRecord() {
  const week = document.querySelector("#metricWeekSelect").value;
  const activeWeek = getActiveMetricWeek()?.label;
  if (week !== activeWeek) {
    flashButton("#saveMetricRecord", "Solo semana activa");
    renderMetricWeek();
    return;
  }

  if (state.metricRecords.some((item) => item.week === week)) {
    flashButton("#saveMetricRecord", "Ya fue registrado");
    renderMetricWeek();
    return;
  }

  const note = document.querySelector("#metricNote").value.trim();
  const values = getCurrentMetricValues();
  const overall = getMetricAverage(values);

  const { error } = await sb.from("metric_records").insert({
    user_id: currentUser.id,
    week,
    ...values,
    overall,
    note,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    flashButton("#saveMetricRecord", error.code === "23505" ? "Ya fue registrado" : "No se pudo guardar");
    await loadStateFromSupabase();
    renderMetricWeek();
    renderMetricHistory();
    return;
  }

  await Promise.all(Object.entries(values).map(([metric_key, value]) =>
    sb.from("metrics").upsert({
      user_id: currentUser.id,
      metric_key,
      value,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,metric_key" })
  ));

  state.metrics = { ...state.metrics, ...values };
  const existingIndex = state.metricRecords.findIndex((item) => item.week === week);
  const record = { week, ...values, overall, note, updated_at: new Date().toISOString() };
  if (existingIndex >= 0) state.metricRecords[existingIndex] = record;
  else state.metricRecords.push(record);

  renderMetricHistory();
  renderMetricWeek();
  updateOverall();
  flashButton("#saveMetricRecord", "Registro guardado");
}

function renderMetricHistory() {
  const container = document.querySelector("#metricHistory");
  if (!container) return;

  const visibleWeeks = getVisibleMetricWeeks();
  const recordsByWeek = new Map(state.metricRecords.map((item) => [item.week, item]));
  const missedCount = visibleWeeks.filter((week) => !recordsByWeek.has(week.label) && week.isPastCompleted).length;

  container.innerHTML = visibleWeeks.length
    ? `
      ${missedCount ? `<div class="metric-missed-summary">${missedCount} ${missedCount === 1 ? "semana sin hacer indicadores" : "semanas sin hacer indicadores"}</div>` : ""}
      ${visibleWeeks.map((week) => {
        const item = recordsByWeek.get(week.label);
        if (!item) {
          return `
            <article class="metric-history-item ${week.isPastCompleted ? "is-missed" : "is-pending"}">
              <span>${escapeHtml(week.label)}</span>
              <strong>${week.isPastCompleted ? "Sin registro" : "Pendiente"}</strong>
              <p>${week.isPastCompleted ? "No se hizo el registro semanal de indicadores." : "Esta semana aún está abierta para registrar indicadores."}</p>
            </article>
          `;
        }
        return `
        <article class="metric-history-item">
          <span>${escapeHtml(item.week)}</span>
          <strong>${Number(item.overall || 0)}%</strong>
          <p>Identidad ${item.identidad || 0}% · Emociones ${item.emociones || 0}% · Retos ${item.retos || 0}% · Servicio ${item.servicio || 0}%</p>
          ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}
        </article>
        `;
      }).join("")}
    `
    : '<p class="empty-state">Aun no hay registros semanales.</p>';
}

function getVisibleMetricWeeks() {
  const serverNow = getServerNow();
  return programWeeks
    .map((week) => ({
      ...week,
      endsAt: new Date(week.startsAt.getTime() + 7 * 24 * 60 * 60 * 1000),
      isStarted: serverNow >= week.startsAt,
      isPastCompleted: serverNow >= new Date(week.startsAt.getTime() + 7 * 24 * 60 * 60 * 1000),
    }))
    .filter((week) => week.isStarted);
}

function hydrateChecks() {
  document.querySelectorAll("[data-check]").forEach((check) => {
    const key = check.dataset.check;
    check.checked = Boolean(state.checks[key]);
    check.disabled = true;
    check.closest(".check-pill")?.classList.add("auto-check");
  });
}

function applyLevelUnlocks() {
  const now = new Date(state.serverProgress.serverNow || new Date().toISOString());
  const completedKeys = new Set(state.serverProgress.completedKeys);

  document.querySelectorAll("[data-unlock]").forEach((row) => {
    const check = row.querySelector("[data-check]");
    const isUnlocked = now >= new Date(`${row.dataset.unlock}T00:00:00-05:00`);
    const isCompleted = completedKeys.has(check.dataset.check);

    row.classList.toggle("is-unlocked", isUnlocked);
    row.classList.toggle("is-locked", !isUnlocked);
    row.classList.toggle("is-auto-complete", isCompleted);
    check.checked = isCompleted;
    check.disabled = true;
    check.closest(".check-pill").querySelector("span").textContent = isCompleted
      ? "Completado por servidor"
      : "Pendiente automático";
  });

  const nextLevel = levelSchedule.find((level) => level.key === state.serverProgress.nextKey)
    || levelSchedule.find((level) => now < new Date(level.unlock));
  const nextDate = document.querySelector("#nextUnlockDate");
  const nextLabel = document.querySelector("#nextUnlockLabel");

  if (nextLevel) {
    nextDate.textContent = nextLevel.label;
    nextLabel.textContent = nextLevel.name;
  } else {
    nextDate.textContent = "Todo";
    nextLabel.textContent = "Todos los niveles estan disponibles";
  }
}

function applyMilestoneMessages() {
  const valiosoMessage = document.querySelector("#valiosoWelcome");
  valiosoMessage.hidden = !state.serverProgress.completedKeys.includes("nivel1");
}

function hydrateLetter() {
  const form = document.querySelector("#achievementForm");
  [...form.elements].forEach((field) => {
    if (!field.name) return;
    field.value = state.letter[field.name] ?? field.value;
    field.addEventListener("input", () => {
      state.letter[field.name] = field.value;
    });
  });

  document.querySelector("#saveLetter").addEventListener("click", async () => {
    [...form.elements].forEach((field) => {
      if (field.name) state.letter[field.name] = field.value;
    });

    const { error } = await sb.from("letters").upsert({
      user_id: currentUser.id,
      data: state.letter,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (error) {
      flashButton("#saveLetter", "Error al guardar");
      return;
    }

    const version = await sb.from("letter_versions").insert({
      user_id: currentUser.id,
      data: state.letter,
    }).select("id, data, created_at").maybeSingle();
    if (!version.error && version.data) {
      state.letterVersions = [version.data, ...state.letterVersions].slice(0, 12);
    }

    renderLetterSavedSummary();
    flashButton("#saveLetter", "Carta guardada");
  });

  document.querySelector("#printLetter").addEventListener("click", printDesignedLetter);
  updateLetterSummary();
  renderLetterSavedSummary();
}

function renderLetterSavedSummary() {
  const summary = document.querySelector("#letterSavedSummary");
  const versionList = document.querySelector("#letterVersionList");
  if (!summary) return;

  const declaration = state.letter.declaration?.trim();
  const name = state.letter.name?.trim() || `${currentProfile?.first_name || ""} ${currentProfile?.last_name || ""}`.trim();
  const date = state.letter.date || "Sin fecha meta";
  const rows = [1, 2, 3].map((index) => ({
    area: state.letter[`area${index}`],
    today: state.letter[`today${index}`],
    target: state.letter[`target${index}`],
    proof: state.letter[`proof${index}`],
  })).filter((row) => row.area || row.today || row.target || row.proof);

  if (!declaration && rows.length === 0) {
    summary.innerHTML = '<p class="empty-state">Aun no hay una carta guardada.</p>';
    if (versionList) versionList.innerHTML = '<p class="empty-state">Aun no hay versiones guardadas.</p>';
    return;
  }

  summary.innerHTML = `
    <strong>${escapeHtml(name || "Participante")}</strong>
    <span>Meta: ${escapeHtml(date)}</span>
    <p>${escapeHtml(declaration || "Declaracion pendiente.")}</p>
    <div class="letter-mini-goals">
      ${rows.map((row) => `<small>${escapeHtml(row.area || "Area")} · hoy ${escapeHtml(row.today || "-")} · meta ${escapeHtml(row.target || "-")}</small>`).join("")}
    </div>
  `;

  if (versionList) {
    versionList.innerHTML = state.letterVersions.length
      ? state.letterVersions.map((version, index) => {
          const versionData = version.data || {};
          const versionDate = new Date(version.created_at).toLocaleString("es-CO", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });
          const versionDeclaration = versionData.declaration || "Declaración pendiente";
          return `<article class="letter-version-item"><span>Versión ${state.letterVersions.length - index} · ${escapeHtml(versionDate)}</span><p>${escapeHtml(versionDeclaration)}</p></article>`;
        }).join("")
      : '<p class="empty-state">Aun no hay versiones guardadas.</p>';
  }
}

function printDesignedLetter() {
  [...document.querySelector("#achievementForm").elements].forEach((field) => {
    if (field.name) state.letter[field.name] = field.value;
  });

  renderPrintLetter();
  document.body.classList.add("print-letter-mode");
  window.print();
  setTimeout(() => document.body.classList.remove("print-letter-mode"), 500);
}

function renderPrintLetter() {
  const profileName = `${currentProfile?.first_name || ""} ${currentProfile?.last_name || ""}`.trim();
  const name = state.letter.name?.trim() || profileName || "Participante";
  document.querySelector("#printLetterName").textContent = name;
  document.querySelector("#printLetterDate").textContent = `Generada el ${new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}`;
  document.querySelector("#printDeclaration").textContent = state.letter.declaration || "Sin declaracion registrada.";
  document.querySelector("#printWeekly").textContent = state.letter.weekly || "Sin compromiso registrado.";
  document.querySelector("#printWitness").textContent = state.letter.witness || "Sin testigo registrado.";
  document.querySelector("#printTargetDate").textContent = state.letter.date || "Sin fecha";

  const goals = [1, 2, 3].map((index) => ({
    area: state.letter[`area${index}`] || `Area ${index}`,
    today: state.letter[`today${index}`] || "-",
    target: state.letter[`target${index}`] || "-",
    proof: state.letter[`proof${index}`] || "-",
    progress: estimateGoalProgress(state.letter[`today${index}`], state.letter[`target${index}`]),
  }));

  const completedGoals = goals.filter((goal) => goal.area && goal.area !== "-").length;
  const averageProgress = Math.round(goals.reduce((sum, goal) => sum + goal.progress, 0) / goals.length);
  document.querySelector("#printGoalCount").textContent = completedGoals;
  document.querySelector("#printAverageProgress").textContent = `${averageProgress}%`;

  document.querySelector("#printGoals").innerHTML = goals.map((goal) => `
    <article class="print-goal-card">
      <div class="print-goal-head">
        <strong>${escapeHtml(goal.area)}</strong>
        <em>${goal.progress}%</em>
      </div>
      <div class="print-progress-track"><i style="width:${goal.progress}%"></i></div>
      <div class="print-goal-values">
        <span>Hoy: ${escapeHtml(goal.today)}</span>
        <span>Meta: ${escapeHtml(goal.target)}</span>
      </div>
      <p>${escapeHtml(goal.proof)}</p>
    </article>
  `).join("");
}

function estimateGoalProgress(today, target) {
  const todayNumber = extractFirstNumber(today);
  const targetNumber = extractFirstNumber(target);
  if (!todayNumber || !targetNumber) return today || target ? 35 : 0;
  return Math.max(0, Math.min(100, Math.round((todayNumber / targetNumber) * 100)));
}

function extractFirstNumber(value) {
  const match = String(value || "").replace(",", ".").match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function hydrateEvidence() {
  const week = document.querySelector("#weekSelect");
  const fields = ["weeklyWin", "weeklyLearning", "weeklyChallenge"].map((id) => document.querySelector(`#${id}`));

  function renderWeek() {
    const saved = state.evidence[week.value] ?? {};
    fields.forEach((field) => {
      field.value = saved[field.id] ?? "";
    });
    document.querySelector("#activeWeekLabel").textContent = week.value;
    const metricWeek = document.querySelector("#metricWeekSelect");
    if (metricWeek && !state.metricRecords.some((item) => item.week === metricWeek.value)) {
      metricWeek.value = week.value;
    }
  }

  week.addEventListener("change", renderWeek);

  document.querySelector("#saveEvidence").addEventListener("click", async () => {
    state.evidence[week.value] = {};
    fields.forEach((field) => {
      state.evidence[week.value][field.id] = field.value;
    });

    await sb.from("evidence").upsert({
      user_id: currentUser.id,
      week: week.value,
      weekly_win: fields[0].value,
      weekly_learning: fields[1].value,
      weekly_challenge: fields[2].value,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,week" });

    updateOverall();
    flashButton("#saveEvidence", "Evidencia guardada");
  });

  renderWeek();
}

function hydrateReflection() {
  const level = document.querySelector("#reflectionLevel");
  const fields = ["takeaway", "keyMoment", "decision", "staffEvidence"].map((id) => document.querySelector(`#${id}`));
  applyReflectionLocks();

  function renderReflection() {
    if (level.disabled) {
      fields.forEach((field) => {
        field.value = "";
      });
      updateReflectionStatus();
      return;
    }

    const saved = state.reflections[level.value] || {};
    fields.forEach((field) => {
      field.value = saved[field.id] || "";
    });
    updateReflectionStatus();
  }

  level.addEventListener("change", renderReflection);

  document.querySelector("#saveReflection").addEventListener("click", async () => {
    if (!state.serverProgress.completedKeys.includes(level.value)) {
      flashButton("#saveReflection", "Nivel bloqueado");
      return;
    }

    state.reflections[level.value] = {};
    fields.forEach((field) => {
      state.reflections[level.value][field.id] = field.value;
    });
    state.approvals[level.value] = state.approvals[level.value] || "pendiente";

    await sb.from("reflections").upsert({
      user_id: currentUser.id,
      level_key: level.value,
      takeaway: fields[0].value,
      key_moment: fields[1].value,
      decision: fields[2].value,
      staff_evidence: fields[3].value,
      approval_status: state.approvals[level.value],
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,level_key" });

    updateReflectionStatus();
    renderReflectionRecord();
    renderAdminLists();
    flashButton("#saveReflection", "Reflexión guardada");
  });

  document.querySelector("#approveReflection")?.addEventListener("click", async () => {
    state.approvals[level.value] = "aprobada";

    await sb.from("reflections").update({
      approval_status: "aprobada",
      approved_by: currentUser.id,
    }).eq("user_id", currentUser.id).eq("level_key", level.value);

    updateReflectionStatus();
    renderAdminLists();
    flashButton("#approveReflection", "Aprobada");
  });

  renderReflection();
  renderReflectionRecord();
}

function applyReflectionLocks() {
  const level = document.querySelector("#reflectionLevel");
  const saveButton = document.querySelector("#saveReflection");
  const completedKeys = new Set(state.serverProgress.completedKeys);
  const availableOptions = [];

  [...level.options].forEach((option) => {
    const isAvailable = completedKeys.has(option.value);
    option.disabled = !isAvailable;
    const label = levelSchedule.find((item) => item.key === option.value)?.name || option.textContent;
    option.textContent = isAvailable ? label.replace(/^Nivel \d+ /, "") : `${label.replace(/^Nivel \d+ /, "")} - bloqueado`;
    if (isAvailable) availableOptions.push(option.value);
  });

  const hasAvailableLevel = availableOptions.length > 0;
  level.disabled = !hasAvailableLevel;
  saveButton.disabled = !hasAvailableLevel;
  saveButton.textContent = hasAvailableLevel ? "Guardar reflexión" : "Reflexión bloqueada";

  document.querySelectorAll("#takeaway, #keyMoment, #decision, #staffEvidence").forEach((field) => {
    if (!field.dataset.placeholder) field.dataset.placeholder = field.placeholder;
    field.disabled = !hasAvailableLevel;
    field.placeholder = hasAvailableLevel
      ? field.dataset.placeholder
      : "Este espacio se desbloquea cuando vivas tu primer fin de semana.";
  });

  if (hasAvailableLevel && !completedKeys.has(level.value)) {
    level.value = availableOptions.at(-1);
  }
}

function updateReflectionStatus() {
  const level = document.querySelector("#reflectionLevel").value;
  const saved = state.reflections[level];
  const status = state.approvals[level];
  const label = levelSchedule.find((item) => item.key === level)?.name || level;
  const summary = document.querySelector("#reflectionStatus");

  if (!state.serverProgress.completedKeys.length) {
    summary.textContent = "Este espacio se desbloquea despues de vivir el primer fin de semana.";
    return;
  }

  if (!saved || !Object.values(saved).some(Boolean)) {
    summary.textContent = `${label}: disponible para registrar tu reflexión.`;
    return;
  }

  summary.textContent = `${label}: ${status === "aprobada" ? "aprobada por staff" : "pendiente de aprobación"}. Momento clave: ${saved.keyMoment || "por completar"}`;
}

function renderReflectionRecord() {
  const container = document.querySelector("#reflectionRecord");
  if (!container) return;

  const entries = levelSchedule
    .map((level) => ({
      ...level,
      reflection: state.reflections[level.key],
      status: state.approvals[level.key],
    }))
    .filter((item) => item.reflection && Object.values(item.reflection).some(Boolean));

  container.innerHTML = entries.length
    ? entries.map((item) => {
        const status = item.status === "aprobada" ? "Aprobada por staff" : "Pendiente de aprobación";
        return `
          <article class="reflection-record-item">
            <div>
              <span>${escapeHtml(item.name)} · ${escapeHtml(status)}</span>
              <strong>${escapeHtml(item.reflection.keyMoment || "Momento importante por completar")}</strong>
            </div>
            <dl>
              <div>
                <dt>Que me llevo</dt>
                <dd>${escapeHtml(item.reflection.takeaway || "Sin respuesta.")}</dd>
              </div>
              <div>
                <dt>Decision</dt>
                <dd>${escapeHtml(item.reflection.decision || "Sin respuesta.")}</dd>
              </div>
              <div>
                <dt>Evidencia</dt>
                <dd>${escapeHtml(item.reflection.staffEvidence || "Sin evidencia registrada.")}</dd>
              </div>
            </dl>
          </article>
        `;
      }).join("")
    : '<p class="empty-state">Aun no tienes reflexiones guardadas.</p>';
}

function hydrateAdmin() {
  bindRegistrationFormatting();

  document.querySelector("#saveParticipant").addEventListener("click", async () => {
    const registrationFields = [
      "#participantFirstName",
      "#participantLastName",
      "#participantWhatsapp",
      "#participantEmail",
      "#participantCohort",
      "#activationCode",
      "#emergencyFirstName",
      "#emergencyLastName",
      "#emergencyPhone",
    ].map((selector) => document.querySelector(selector));

    const invalidField = registrationFields.find((field) => !field.checkValidity());
    if (invalidField) {
      invalidField.reportValidity();
      flashButton("#saveParticipant", "Revisa los datos");
      return;
    }

    const firstName = document.querySelector("#participantFirstName").value.trim();
    const lastName = document.querySelector("#participantLastName").value.trim();
    const whatsapp = formatColombianPhone(document.querySelector("#participantWhatsapp").value);
    const email = document.querySelector("#participantEmail").value.trim().toLowerCase();
    const visionName = document.querySelector("#participantCohort").value.trim();
    const code = document.querySelector("#activationCode").value.trim().toUpperCase();
    const emergencyFirstName = document.querySelector("#emergencyFirstName").value.trim();
    const emergencyLastName = document.querySelector("#emergencyLastName").value.trim();
    const emergencyPhone = formatColombianPhone(document.querySelector("#emergencyPhone").value);

    if (!firstName && !whatsapp) return;

    const { error } = await sb.rpc("preregister_participant", {
      p_first_name: firstName,
      p_last_name: lastName,
      p_whatsapp: whatsapp,
      p_email: email,
      p_cohort: visionName,
      p_code: code,
      p_staff_id: currentProfile.id,
      p_emergency_first_name: emergencyFirstName,
      p_emergency_last_name: emergencyLastName,
      p_emergency_phone: emergencyPhone,
    });

    if (error) {
      flashButton("#saveParticipant", "Error al guardar");
      return;
    }

    ["participantFirstName", "participantLastName", "participantWhatsapp", "participantEmail",
     "emergencyFirstName", "emergencyLastName", "emergencyPhone"].forEach((id) => {
      document.querySelector(`#${id}`).value = "";
    });
    document.querySelector("#activationCode").value = generateActivationCode();
    loadResourceParticipantOptions();
    renderAdminLists();
    flashButton("#saveParticipant", "Participante guardado");
  });

  document.querySelector("#resourceAudience")?.addEventListener("change", () => {
    const isStaff = document.querySelector("#resourceAudience").value === "staff";
    const participantSelect = document.querySelector("#resourceParticipant");
    if (participantSelect) {
      participantSelect.disabled = isStaff;
      participantSelect.value = "";
    }
  });

  document.querySelector("#saveResource").addEventListener("click", async () => {
    const audience = document.querySelector("#resourceAudience")?.value || "participants";
    const levelKey = document.querySelector("#adminLevel").value;
    const participantId = audience === "participants" ? (document.querySelector("#resourceParticipant")?.value || null) : null;
    const title = document.querySelector("#resourceTitle").value.trim();
    const link = document.querySelector("#resourceLink").value.trim();
    const fileInput = document.querySelector("#resourceFile");
    const file = fileInput?.files?.[0] || null;

    if (!title && !link && !file) return;

    let filePath = null;
    let fileName = null;
    let resourceLink = link;

    if (file) {
      const safeName = file.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 120);
      fileName = file.name;
      filePath = `${currentProfile.id}/${Date.now()}-${safeName}`;
      const upload = await sb.storage.from("resource-files").upload(filePath, file, { upsert: false });

      if (upload.error) {
        flashButton("#saveResource", "Error al subir archivo");
        return;
      }

      const publicUrl = sb.storage.from("resource-files").getPublicUrl(filePath);
      resourceLink = resourceLink || publicUrl.data?.publicUrl || "";
    }

    const { error } = await sb.from("resources").insert({
      level_key: levelKey,
      title: title || fileName || "Recurso sin titulo",
      link: resourceLink,
      file_path: filePath,
      file_name: fileName,
      audience,
      target_participant_id: participantId,
      created_by: currentProfile.id,
    });

    if (error) {
      flashButton("#saveResource", "Error al guardar");
      return;
    }

    document.querySelector("#resourceTitle").value = "";
    document.querySelector("#resourceLink").value = "";
    if (fileInput) fileInput.value = "";
    renderAdminLists();
    renderPendingActivities();
    renderMiniTeam();
    flashButton("#saveResource", "Recurso cargado");
  });

  document.querySelector("#refreshAdmin")?.addEventListener("click", async () => {
    await renderAdminLists();
    flashButton("#refreshAdmin", "Actualizado");
  });

  document.querySelector("#assignMiniTeam")?.addEventListener("click", async () => {
    await assignMiniTeamParticipant();
  });

  document.querySelector("#saveSupportSlot")?.addEventListener("click", async () => {
    await saveSupportSlot();
  });

  loadResourceParticipantOptions();
  loadMiniTeamAssignmentOptions();
  renderSupportSlotAdminList();
  renderAdminLists();
}

async function loadResourceParticipantOptions() {
  const select = document.querySelector("#resourceParticipant");
  if (!select || !currentProfile || currentProfile.role === "participant") return;

  let query = sb.from("profiles")
    .select("id, first_name, last_name, email, whatsapp")
    .eq("role", "participant")
    .order("first_name", { ascending: true });

  if (currentProfile.role === "staff") {
    query = query.eq("staff_id", currentProfile.id);
  }

  const { data, error } = await query;
  if (error) return;

  select.innerHTML = '<option value="">Todos mis participantes</option>';
  (data || []).forEach((participant) => {
    const name = `${participant.first_name || ""} ${participant.last_name || ""}`.trim();
    const option = document.createElement("option");
    option.value = participant.id;
    option.textContent = name || participant.email || participant.whatsapp || "Participante";
    select.appendChild(option);
  });
}

async function loadMiniTeamAssignmentOptions() {
  if (!currentProfile || currentProfile.role !== "admin") return;

  const staffSelect = document.querySelector("#miniTeamStaffSelect");
  const participantSelect = document.querySelector("#miniTeamParticipantSelect");
  if (!staffSelect || !participantSelect) return;

  const [staffRes, participantRes] = await Promise.all([
    sb.from("profiles").select("id, first_name, last_name, email").in("role", ["staff", "admin"]).order("first_name", { ascending: true }),
    sb.from("profiles").select("id, first_name, last_name, email, whatsapp, staff_id").eq("role", "participant").order("first_name", { ascending: true }),
  ]);

  staffSelect.innerHTML = '<option value="">Selecciona un staff</option>';
  (staffRes.data || []).forEach((staff) => {
    const option = document.createElement("option");
    option.value = staff.id;
    option.textContent = displayPersonName(staff, "Staff");
    staffSelect.appendChild(option);
  });

  participantSelect.innerHTML = '<option value="">Selecciona un participante</option>';
  (participantRes.data || []).forEach((participant) => {
    const option = document.createElement("option");
    option.value = participant.id;
    const assignedStaff = (staffRes.data || []).find((staff) => staff.id === participant.staff_id);
    const suffix = assignedStaff ? ` · actual: ${displayPersonName(assignedStaff, "Staff")}` : " · sin staff";
    option.textContent = `${displayPersonName(participant, "Participante")}${suffix}`;
    participantSelect.appendChild(option);
  });
}

async function assignMiniTeamParticipant() {
  const staffId = document.querySelector("#miniTeamStaffSelect")?.value;
  const participantId = document.querySelector("#miniTeamParticipantSelect")?.value;

  if (!staffId || !participantId) {
    flashButton("#assignMiniTeam", "Elige staff y participante");
    return;
  }

  const { data, error } = await sb.rpc("assign_participant_to_staff", {
    p_staff_id: staffId,
    p_participant_id: participantId,
  });

  if (error || data?.success === false) {
    flashButton("#assignMiniTeam", "Error al asignar");
    return;
  }

  await Promise.all([
    loadResourceParticipantOptions(),
    loadMiniTeamAssignmentOptions(),
    renderAdminLists(),
    renderMiniTeam(),
  ]);
  flashButton("#assignMiniTeam", "Mini equipo asignado");
}

async function renderPendingActivities() {
  const resourceContainer = document.querySelector("#participantResourceList");
  const ticketContainer = document.querySelector("#pendingActivityTickets");
  if (!resourceContainer || !ticketContainer || !currentProfile) return;

  const availableLevels = state.serverProgress.completedKeys;
  if (!availableLevels.length) {
    resourceContainer.innerHTML = '<p class="empty-state">Las guías se desbloquean después de vivir el primer fin de semana.</p>';
  } else {
    const { data: resources, error } = await sb.from("resources")
      .select("*")
      .in("level_key", availableLevels)
      .eq("audience", "participants")
      .order("created_at", { ascending: false });

    if (error) {
      resourceContainer.innerHTML = '<p class="empty-state">No pudimos cargar las guías en este momento.</p>';
    } else {
      const visibleResources = (resources || []).filter((resource) =>
        !resource.target_participant_id || resource.target_participant_id === currentProfile.id
      );

      resourceContainer.innerHTML = visibleResources.length
        ? visibleResources.map(renderActivityResource).join("")
        : '<p class="empty-state">No hay guías disponibles todavía.</p>';
    }
  }

  if (currentProfile.role !== "participant") {
    ticketContainer.innerHTML = '<p class="empty-state">Los tickets pendientes se muestran en la vista de participante.</p>';
    return;
  }

  const { data: tickets, error: ticketError } = await sb.from("tickets")
    .select("*")
    .eq("participant_id", currentProfile.id)
    .neq("status", "aprobado")
    .order("created_at", { ascending: false });

  if (ticketError) {
    ticketContainer.innerHTML = '<p class="empty-state">No pudimos cargar tus tickets pendientes.</p>';
    return;
  }

  ticketContainer.innerHTML = tickets?.length
    ? tickets.map(renderPendingActivityTicket).join("")
    : '<p class="empty-state">No tienes tickets pendientes.</p>';
}

function renderActivityResource(resource) {
  const levelLabel = levelSchedule.find((level) => level.key === resource.level_key)?.name || resource.level_key;
  const link = resource.link || "";
  const isUrl = /^https?:\/\//i.test(link);
  const actionLabel = resource.file_name ? "Descargar archivo" : "Abrir guía";

  return `
    <article class="activity-item">
      <span>${escapeHtml(levelLabel)}</span>
      <strong>${escapeHtml(resource.title || "Guía sin título")}</strong>
      <p>${escapeHtml(resource.file_name || link || "Sin instrucción adicional.")}</p>
      ${isUrl ? `<a class="action-link" href="${escapeHtml(link)}" target="_blank" rel="noopener" ${resource.file_name ? "download" : ""}>${actionLabel}</a>` : ""}
    </article>
  `;
}

function renderPendingActivityTicket(ticket) {
  const transition = levelTransitions.find((item) => item.from === ticket.from_level && item.to === ticket.to_level);
  const status = ticket.status === "completado" ? "En revisión" : "Pendiente";

  return `
    <article class="activity-item">
      <span>${escapeHtml(transition?.label || "Actividad asignada")} · ${escapeHtml(status)}</span>
      <strong>${escapeHtml(ticket.title || "Ticket sin título")}</strong>
      <p>${escapeHtml(ticket.description || "Sin descripción adicional.")}</p>
      <a class="action-link" href="#tickets" data-jump-section="tickets">Ir a tickets</a>
    </article>
  `;
}

async function hydrateSupport() {
  document.querySelectorAll(".support-panel").forEach((panel) => {
    const date = panel.querySelector('[data-support-field="date"]');
    if (date && !date.value) date.value = new Date().toISOString().slice(0, 10);

    panel.querySelector(".support-save")?.addEventListener("click", async () => {
      await saveSupportRecord(panel);
    });
  });

  document.querySelector("#refreshSupport")?.addEventListener("click", async () => {
    await loadSupportSlots();
    await renderSupportRecords();
    flashButton("#refreshSupport", "Actualizado");
  });

  await loadSupportSlots();
  await renderSupportRecords();
}

async function saveSupportRecord(panel) {
  const type = panel.dataset.supportType;
  const slotSelect = panel.querySelector('[data-support-field="slot"]');
  const selectedOption = slotSelect?.selectedOptions?.[0];
  const date = panel.querySelector('[data-support-field="date"]')?.value || selectedOption?.dataset.date || "";
  const time = selectedOption?.dataset.time || null;
  const topic = panel.querySelector('[data-support-field="topic"]').value.trim();
  const notes = panel.querySelector('[data-support-field="notes"]').value.trim();
  const button = panel.querySelector(".support-save");

  if (!date || !topic || !notes || (slotSelect && !slotSelect.value)) {
    flashButtonSelector(button, "Completa todo");
    return;
  }

  const saveRequest = slotSelect
    ? await sb.rpc("book_support_slot", {
        p_slot_id: slotSelect.value,
        p_topic: topic,
        p_notes: notes,
      })
    : await sb.from("support_records").insert({
        user_id: currentUser.id,
        support_type: type,
        support_date: date,
        support_time: time,
        support_slot_id: null,
        topic,
        notes,
      });

  if (saveRequest.error || saveRequest.data?.success === false) {
    flashButtonSelector(button, saveRequest.data?.message || "Error al guardar");
    return;
  }

  panel.querySelector('[data-support-field="topic"]').value = "";
  panel.querySelector('[data-support-field="notes"]').value = "";
  if (slotSelect) slotSelect.value = "";
  await loadSupportSlots();
  await renderSupportRecords();
  flashButtonSelector(button, "Guardado");
}

async function loadSupportSlots() {
  if (!currentUser || currentProfile?.role !== "participant") return;

  const { data, error } = await sb.from("support_slots")
    .select("*, support_records(id)")
    .eq("is_active", true)
    .gte("slot_date", new Date().toISOString().slice(0, 10))
    .order("slot_date", { ascending: true })
    .order("start_time", { ascending: true });

  document.querySelectorAll('[data-support-field="slot"]').forEach((select) => {
    const panel = select.closest(".support-panel");
    const type = panel?.dataset.supportType;
    select.innerHTML = '<option value="">Selecciona día y hora</option>';

    if (error) {
      select.innerHTML = '<option value="">Ejecuta primero la actualización SQL</option>';
      return;
    }

    const available = (data || []).filter((slot) => {
      const booked = slot.support_records?.length || 0;
      return slot.support_type === type && booked < Number(slot.capacity || 1);
    });

    if (!available.length) {
      select.innerHTML = '<option value="">No hay horarios disponibles</option>';
      return;
    }

    available.forEach((slot) => {
      const option = document.createElement("option");
      option.value = slot.id;
      option.dataset.date = slot.slot_date;
      option.dataset.time = slot.start_time;
      option.textContent = `${formatSlotDate(slot.slot_date)} · ${formatSlotTime(slot.start_time)}-${formatSlotTime(slot.end_time)} · ${Number(slot.capacity || 1) - (slot.support_records?.length || 0)} cupo(s)`;
      select.appendChild(option);
    });
  });
}

async function saveSupportSlot() {
  const type = document.querySelector("#supportSlotType")?.value;
  const date = document.querySelector("#supportSlotDate")?.value;
  const start = document.querySelector("#supportSlotStart")?.value;
  const end = document.querySelector("#supportSlotEnd")?.value;
  const capacity = Number(document.querySelector("#supportSlotCapacity")?.value || 1);

  if (!type || !date || !start || !end || capacity < 1) {
    flashButton("#saveSupportSlot", "Completa horario");
    return;
  }

  const { error } = await sb.from("support_slots").insert({
    support_type: type,
    slot_date: date,
    start_time: start,
    end_time: end,
    capacity,
    created_by: currentProfile.id,
  });

  if (error) {
    flashButton("#saveSupportSlot", "Error al guardar");
    return;
  }

  ["supportSlotDate", "supportSlotStart", "supportSlotEnd"].forEach((id) => {
    const field = document.querySelector(`#${id}`);
    if (field) field.value = "";
  });
  await renderSupportSlotAdminList();
  await loadSupportSlots();
  flashButton("#saveSupportSlot", "Horario habilitado");
}

async function renderSupportSlotAdminList() {
  const container = document.querySelector("#supportSlotAdminList");
  if (!container || !currentProfile || currentProfile.role === "participant") return;

  const { data, error } = await sb.from("support_slots")
    .select("*, support_records(id)")
    .order("slot_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    container.innerHTML = '<p class="empty-state">Ejecuta primero la actualización SQL de agenda.</p>';
    return;
  }

  container.innerHTML = data?.length
    ? data.map((slot) => {
        const booked = slot.support_records?.length || 0;
        return `<div class="approval-item"><span>${escapeHtml(supportTypeLabel(slot.support_type))} · ${escapeHtml(formatSlotDate(slot.slot_date))}</span><p>${escapeHtml(formatSlotTime(slot.start_time))}-${escapeHtml(formatSlotTime(slot.end_time))}<br>${booked}/${slot.capacity || 1} cupos reservados</p></div>`;
      }).join("")
    : "<p>No hay horarios habilitados.</p>";
}

async function renderSupportRecords() {
  const container = document.querySelector("#supportRecordList");
  if (!container || !currentUser) return;

  const { data, error } = await sb.from("support_records")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("support_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = '<p class="empty-state">No pudimos cargar el historial. Ejecuta la actualización SQL de acompañamiento si aún no existe.</p>';
    return;
  }

  container.innerHTML = data?.length
    ? data.map(renderSupportRecord).join("")
    : '<p class="empty-state">Aún no hay registros de acompañamiento.</p>';
}

function renderSupportRecord(record) {
  const labels = {
    coaching: "Coaching individual",
    psicologico: "Acompañamiento psicológico",
    buddy: "Buddy de responsabilidad",
  };

  return `
    <article class="support-record-item">
      <span>${escapeHtml(labels[record.support_type] || record.support_type)} · ${escapeHtml(record.support_date || "")}${record.support_time ? ` · ${escapeHtml(formatSlotTime(record.support_time))}` : ""}</span>
      <strong>${escapeHtml(record.topic || "Sin tema")}</strong>
      <p>${escapeHtml(record.notes || "Sin notas")}</p>
    </article>
  `;
}

function formatSlotDate(value) {
  if (!value) return "";
  return new Date(`${value}T00:00:00-05:00`).toLocaleDateString("es-CO", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function formatSlotTime(value) {
  return String(value || "").slice(0, 5);
}

async function hydrateResourceTools() {
  document.querySelectorAll(".resource-tool").forEach((panel) => {
    panel.querySelector(".resource-tool-save")?.addEventListener("click", async () => {
      await saveResourceToolRecord(panel);
    });
  });

  document.querySelector("#refreshResourceTools")?.addEventListener("click", async () => {
    await renderResourceToolRecords();
    flashButton("#refreshResourceTools", "Actualizado");
  });

  await renderResourceToolRecords();
}

async function saveResourceToolRecord(panel) {
  const resourceType = panel.dataset.resourceType;
  const titleField = panel.querySelector('[data-resource-field="title"]');
  const scoreField = panel.querySelector('[data-resource-field="score"]');
  const notesField = panel.querySelector('[data-resource-field="notes"]');
  const button = panel.querySelector(".resource-tool-save");

  const title = titleField.value.trim();
  const score = String(scoreField.value || "").trim();
  const notes = notesField.value.trim();

  if (!title || !score || !notes) {
    flashButtonSelector(button, "Completa todo");
    return;
  }

  const { error } = await sb.from("resource_tool_records").insert({
    user_id: currentUser.id,
    resource_type: resourceType,
    title,
    score,
    notes,
  });

  if (error) {
    flashButtonSelector(button, "Error al guardar");
    return;
  }

  if (titleField.tagName !== "SELECT") titleField.value = "";
  if (scoreField.tagName !== "SELECT") scoreField.value = "";
  notesField.value = "";
  await renderResourceToolRecords();
  flashButtonSelector(button, "Guardado");
}

async function renderResourceToolRecords() {
  const container = document.querySelector("#resourceToolRecordList");
  if (!container || !currentUser) return;

  const { data, error } = await sb.from("resource_tool_records")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = '<p class="empty-state">No pudimos cargar tus recursos trabajados.</p>';
    return;
  }

  container.innerHTML = data?.length
    ? data.map(renderResourceToolRecord).join("")
    : '<p class="empty-state">Aún no hay recursos registrados.</p>';
}

function renderResourceToolRecord(record) {
  const labels = {
    diagnostico: "Diagnóstico",
    feedback: "Feedback 360",
    practica: "Práctica",
    impacto: "Proyecto de impacto",
  };

  return `
    <article class="resource-record-item">
      <span>${escapeHtml(labels[record.resource_type] || record.resource_type)} · ${escapeHtml(record.score || "")}</span>
      <strong>${escapeHtml(record.title || "Sin título")}</strong>
      <p>${escapeHtml(record.notes || "Sin notas")}</p>
    </article>
  `;
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#refreshActivities")?.addEventListener("click", async () => {
    await renderPendingActivities();
    flashButton("#refreshActivities", "Actualizado");
  });

  document.querySelector("#refreshMiniTeam")?.addEventListener("click", async () => {
    await renderMiniTeam();
    flashButton("#refreshMiniTeam", "Actualizado");
  });

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-jump-section]");
    if (!trigger) return;
    event.preventDefault();
    navigateTo(trigger.dataset.jumpSection);
  });

  document.addEventListener("change", async (event) => {
    const check = event.target.closest("[data-mini-check]");
    if (!check || !currentProfile || currentProfile.role === "participant") return;
    await saveMiniTeamCheck(check);
  });
});

async function hydrateMiniTeam() {
  if (!currentProfile || currentProfile.role === "participant") return;
  await renderMiniTeam();
}

async function renderMiniTeam() {
  if (!currentProfile || currentProfile.role === "participant") return;

  const staffResources = document.querySelector("#staffResourceList");
  const miniTeamList = document.querySelector("#miniTeamList");
  if (!staffResources || !miniTeamList) return;

  let participantQuery = sb.from("profiles")
    .select("id, first_name, last_name, email, whatsapp")
    .eq("role", "participant")
    .order("first_name", { ascending: true });

  if (currentProfile.role === "staff") {
    participantQuery = participantQuery.eq("staff_id", currentProfile.id);
  }

  const [participantRes, checksRes, resourceRes] = await Promise.all([
    participantQuery,
    sb.from("mini_team_checks").select("*").eq("staff_id", currentProfile.id),
    sb.from("resources").select("*").eq("audience", "staff").order("created_at", { ascending: false }),
  ]);

  if (participantRes.error) {
    miniTeamList.innerHTML = '<p class="empty-state">No pudimos cargar tu mini equipo.</p>';
    return;
  }

  if (checksRes.error) {
    miniTeamList.innerHTML = '<p class="empty-state">Ejecuta primero la actualización SQL de mini equipos en Supabase.</p>';
    return;
  }

  const checkMap = new Map((checksRes.data || []).map((item) => [`${item.participant_id}:${item.check_key}`, item.is_enabled]));
  const participants = participantRes.data || [];

  staffResources.innerHTML = resourceRes.error
    ? '<p class="empty-state">Ejecuta primero la actualización SQL de recursos internos en Supabase.</p>'
    : (resourceRes.data || []).length
    ? resourceRes.data.map(renderStaffResource).join("")
    : '<p class="empty-state">No hay material interno cargado todavía.</p>';

  miniTeamList.innerHTML = participants.length
    ? participants.map((participant) => renderMiniTeamParticipant(participant, checkMap)).join("")
    : '<p class="empty-state">No hay participantes asignados todavía.</p>';
}

function renderStaffResource(resource) {
  const levelLabel = levelSchedule.find((level) => level.key === resource.level_key)?.name || resource.level_key;
  const link = resource.link || "";
  const isUrl = /^https?:\/\//i.test(link);
  return `
    <div class="approval-item">
      <span>${escapeHtml(levelLabel)} · Staff</span>
      <p><strong>${escapeHtml(resource.title || "Material interno")}</strong><br>${escapeHtml(resource.file_name || link || "Sin instrucción adicional.")}</p>
      ${isUrl ? `<a class="action-link" href="${escapeHtml(link)}" target="_blank" rel="noopener" ${resource.file_name ? "download" : ""}>${resource.file_name ? "Descargar archivo" : "Abrir material"}</a>` : ""}
    </div>
  `;
}

function renderMiniTeamParticipant(participant, checkMap) {
  const name = displayPersonName(participant, "Participante");
  return `
    <article class="mini-team-card">
      <div>
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(participant.email || participant.whatsapp || "Sin contacto")}</span>
      </div>
      <div class="mini-check-grid">
        ${miniTeamChecks.map((item) => {
          const checked = checkMap.get(`${participant.id}:${item.key}`) ? "checked" : "";
          return `
            <label class="mini-check">
              <input type="checkbox" data-mini-check="${escapeHtml(item.key)}" data-participant-id="${escapeHtml(participant.id)}" ${checked} />
              <span>${escapeHtml(item.label)}</span>
            </label>
          `;
        }).join("")}
      </div>
    </article>
  `;
}

async function saveMiniTeamCheck(check) {
  const participantId = check.dataset.participantId;
  const checkKey = check.dataset.miniCheck;
  const isEnabled = check.checked;

  await sb.from("mini_team_checks").upsert({
    staff_id: currentProfile.id,
    participant_id: participantId,
    check_key: checkKey,
    is_enabled: isEnabled,
    updated_at: new Date().toISOString(),
  }, { onConflict: "staff_id,participant_id,check_key" });
}

function bindRegistrationFormatting() {
  ["participantWhatsapp", "emergencyPhone"].forEach((id) => {
    const input = document.querySelector(`#${id}`);
    input.addEventListener("blur", () => {
      if (input.value.trim() && input.checkValidity()) {
        input.value = formatColombianPhone(input.value);
      }
    });
  });

  const activationCode = document.querySelector("#activationCode");
  activationCode.addEventListener("input", () => {
    activationCode.value = activationCode.value.toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ0-9-]/g, "");
  });

  const email = document.querySelector("#participantEmail");
  email.addEventListener("blur", () => {
    email.value = email.value.trim().toLowerCase();
  });
}

function formatColombianPhone(value) {
  const digits = String(value).replace(/\D/g, "");
  const withoutCountry = digits.startsWith("57") ? digits.slice(2) : digits;
  return `+57 ${withoutCountry.slice(0, 3)} ${withoutCountry.slice(3, 6)} ${withoutCountry.slice(6, 10)}`;
}

async function renderAdminLists() {
  if (currentProfile.role === "participant") return;

  const approvals = document.querySelector("#approvalList");
  const participants = document.querySelector("#participantList");
  const progressList = document.querySelector("#participantProgressList");
  const resources = document.querySelector("#resourceList");
  const activityFeed = document.querySelector("#adminActivityFeed");

  let reflQuery = sb.from("reflections").select("*, profiles!inner(first_name, last_name)");
  let pendingQuery = sb.from("pending_participants").select("*");
  let activeQuery = sb.from("profiles").select("*").eq("role", "participant");
  const resQuery = sb.from("resources").select("*").order("created_at", { ascending: false });
  const staffQuery = sb.from("profiles").select("id, first_name, last_name, role").in("role", ["staff", "admin"]);

  if (currentProfile.role === "staff") {
    pendingQuery = pendingQuery.eq("staff_id", currentProfile.id);
    activeQuery = activeQuery.eq("staff_id", currentProfile.id);
  }

  const [reflRes, pendingRes, activeRes, resRes, staffRes] = await Promise.all([
    reflQuery,
    pendingQuery.order("created_at", { ascending: false }),
    activeQuery.order("created_at", { ascending: false }),
    resQuery,
    staffQuery,
  ]);

  const staffMap = new Map((staffRes.data || []).map((staff) => [staff.id, displayPersonName(staff, "Staff")]));
  const partData = [
    ...(pendingRes.data || []).map((p) => ({ ...p, _pending: true })),
    ...(activeRes.data || []).map((p) => ({ ...p, _pending: false })),
  ];
  const activeIds = (activeRes.data || []).map((p) => p.id);
  const participantMap = new Map(partData.map((participant) => [participant.id, displayPersonName(participant, "Participante")]));

  let letters = [];
  let evidence = [];
  let metricRecords = [];
  let supportRecords = [];
  let resourceToolRecords = [];
  let miniChecks = [];

  if (activeIds.length) {
    let miniChecksQuery = sb.from("mini_team_checks")
      .select("staff_id, participant_id, check_key, is_enabled, updated_at")
      .in("participant_id", activeIds);
    if (currentProfile.role === "staff") {
      miniChecksQuery = miniChecksQuery.eq("staff_id", currentProfile.id);
    }

    const [lettersRes, evidenceRes, metricRecordsRes, supportRes, resourceToolRes, miniChecksRes] = await Promise.all([
      sb.from("letters").select("user_id, data, updated_at").in("user_id", activeIds),
      sb.from("evidence").select("user_id, week, weekly_win, weekly_learning, weekly_challenge, updated_at").in("user_id", activeIds),
      sb.from("metric_records").select("user_id, week, overall, updated_at").in("user_id", activeIds),
      sb.from("support_records").select("user_id, support_type, support_date, topic, notes, created_at").in("user_id", activeIds),
      sb.from("resource_tool_records").select("user_id, resource_type, title, score, notes, created_at").in("user_id", activeIds),
      miniChecksQuery,
    ]);
    letters = lettersRes.data || [];
    evidence = evidenceRes.data || [];
    metricRecords = metricRecordsRes.data || [];
    supportRecords = supportRes.data || [];
    resourceToolRecords = resourceToolRes.data || [];
    miniChecks = miniChecksRes.data || [];
  }

  const scopedReflections = activeIds.length
    ? (reflRes.data || []).filter((r) => activeIds.includes(r.user_id))
    : [];

  const reflections = scopedReflections.filter((r) =>
    r.takeaway || r.key_moment || r.decision || r.staff_evidence
  );

  if (progressList) {
    progressList.innerHTML = (activeRes.data || []).length
      ? (activeRes.data || []).map((participant) =>
          renderParticipantProgress(participant, { letters, evidence, reflections, metricRecords, supportRecords, resourceToolRecords })
        ).join("")
      : "<p>No hay participantes activos todavía.</p>";
  }

  approvals.innerHTML = reflections.length
    ? reflections.map((r) => {
        const name = `${r.profiles?.first_name || ""} ${r.profiles?.last_name || ""}`.trim() || "Participante";
        const label = levelSchedule.find((l) => l.key === r.level_key)?.name || r.level_key;
        const status = r.approval_status === "aprobada" ? "Aprobada" : "Pendiente";
        return `<div class="approval-item"><span>${escapeHtml(name)} · ${escapeHtml(label)} · ${status}</span><p>${escapeHtml(r.takeaway || "Sin respuesta.")}</p></div>`;
      }).join("")
    : "<p>No hay reflexiones enviadas todavía.</p>";

  participants.innerHTML = partData.length
    ? partData.map((p) => {
        const name = `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Sin nombre";
        const emergencyName = `${p.emergency_first_name || ""} ${p.emergency_last_name || ""}`.trim() || "Sin contacto";
        const statusLabel = p._pending ? `Código: ${p.activation_code || "—"}` : "Activado";
        return `<div class="approval-item"><span>${escapeHtml(name)} · ${statusLabel}</span><p>WhatsApp: ${escapeHtml(p.whatsapp || "—")}<br>Emergencia: ${escapeHtml(emergencyName)} · ${escapeHtml(p.emergency_phone || "—")}</p></div>`;
      }).join("")
    : "<p>No hay participantes registrados.</p>";

  const resData = resRes.data || [];
  resources.innerHTML = resData.length
    ? resData.map((r) => {
        const label = levelSchedule.find((l) => l.key === r.level_key)?.name || r.level_key;
        const staffName = staffMap.get(r.created_by) || "Staff";
        const audience = r.audience === "staff" ? "Staff" : "Participantes";
        const target = r.audience === "staff"
          ? "Equipo staff"
          : (r.target_participant_id ? (participantMap.get(r.target_participant_id) || "Participante asignado") : "Todos los participantes");
        const file = r.file_name ? `<br>Archivo: ${escapeHtml(r.file_name)}` : "";
        return `<div class="approval-item"><span>${escapeHtml(label)} · ${escapeHtml(audience)} · ${escapeHtml(target)}</span><p><strong>${escapeHtml(r.title)}</strong><br>Cargado por: ${escapeHtml(staffName)}${file}<br>${escapeHtml(r.link || "Sin enlace.")}</p></div>`;
      }).join("")
    : "<p>No hay recursos cargados.</p>";

  if (activityFeed) {
    activityFeed.innerHTML = renderAdminActivityFeed({
      pendingParticipants: pendingRes.data || [],
      activeParticipants: activeRes.data || [],
      resources: resData,
      reflections,
      evidence,
      metricRecords,
      supportRecords,
      resourceToolRecords,
      miniChecks,
      participantMap,
      staffMap,
    });
  }
}

function renderAdminActivityFeed(data) {
  const events = [];

  data.pendingParticipants.forEach((participant) => {
    events.push({
      date: participant.created_at,
      actor: data.staffMap.get(participant.staff_id) || "Staff",
      title: "registró participante",
      body: `${displayPersonName(participant, "Participante")} quedó precargado con código ${participant.activation_code || "pendiente"}.`,
    });
  });

  data.activeParticipants.forEach((participant) => {
    events.push({
      date: participant.created_at,
      actor: displayPersonName(participant, "Participante"),
      title: "activó su cuenta",
      body: `${displayPersonName(participant, "Participante")} ya puede ingresar al portal.`,
    });
  });

  data.resources.forEach((resource) => {
    const label = levelSchedule.find((l) => l.key === resource.level_key)?.name || resource.level_key;
    const target = resource.audience === "staff"
      ? "el equipo staff"
      : (resource.target_participant_id
        ? data.participantMap.get(resource.target_participant_id) || "un participante"
        : "todos sus participantes");
    events.push({
      date: resource.created_at,
      actor: data.staffMap.get(resource.created_by) || "Staff",
      title: "cargó material",
      body: `${resource.title || "Recurso"} para ${target} en ${label}.`,
    });
  });

  data.evidence.forEach((item) => {
    events.push({
      date: item.updated_at,
      actor: data.participantMap.get(item.user_id) || "Participante",
      title: "registró evidencia semanal",
      body: `${item.week}: ${item.weekly_win || "sin logro observable"}.`,
    });
  });

  data.metricRecords.forEach((item) => {
    events.push({
      date: item.updated_at,
      actor: data.participantMap.get(item.user_id) || "Participante",
      title: "guardó indicadores",
      body: `${item.week} quedó en ${item.overall || 0}%.`,
    });
  });

  data.reflections.forEach((item) => {
    const label = levelSchedule.find((l) => l.key === item.level_key)?.name || item.level_key;
    events.push({
      date: item.updated_at || item.created_at,
      actor: data.participantMap.get(item.user_id) || "Participante",
      title: "guardó reflexión",
      body: `${label}: ${item.key_moment || item.takeaway || "reflexión registrada"}.`,
    });
  });

  data.supportRecords.forEach((item) => {
    events.push({
      date: item.created_at,
      actor: data.participantMap.get(item.user_id) || "Participante",
      title: "registró acompañamiento",
      body: `${supportTypeLabel(item.support_type)}: ${item.topic || "sin tema"}.`,
    });
  });

  data.resourceToolRecords.forEach((item) => {
    events.push({
      date: item.created_at,
      actor: data.participantMap.get(item.user_id) || "Participante",
      title: "trabajó recurso",
      body: `${resourceToolLabel(item.resource_type)}: ${item.title || item.score || "registro guardado"}.`,
    });
  });

  data.miniChecks.forEach((item) => {
    events.push({
      date: item.updated_at,
      actor: data.staffMap.get(item.staff_id) || "Staff",
      title: item.is_enabled ? "habilitó acción" : "desmarcó acción",
      body: `${miniTeamCheckLabel(item.check_key)} para ${data.participantMap.get(item.participant_id) || "un participante"}.`,
    });
  });

  const sortedEvents = events
    .filter((event) => event.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 40);

  return sortedEvents.length
    ? sortedEvents.map((event) => `
      <div class="approval-item activity-log-item">
        <span>${escapeHtml(formatDateTime(event.date))} · ${escapeHtml(event.actor)}</span>
        <p><strong>${escapeHtml(event.title)}</strong><br>${escapeHtml(event.body)}</p>
      </div>
    `).join("")
    : "<p>No hay movimientos registrados todavía.</p>";
}

function displayPersonName(person, fallback) {
  return `${person.first_name || ""} ${person.last_name || ""}`.trim() || person.email || person.whatsapp || fallback;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function supportTypeLabel(type) {
  const labels = { coaching: "Coaching", psicologico: "Acompañamiento psicológico", buddy: "Buddy check-in" };
  return labels[type] || type || "Acompañamiento";
}

function resourceToolLabel(type) {
  const labels = {
    diagnostico: "Diagnóstico",
    feedback: "Feedback 360",
    practica: "Práctica",
    impacto: "Proyecto de impacto",
  };
  return labels[type] || type || "Recurso";
}

function miniTeamCheckLabel(key) {
  return miniTeamChecks.find((item) => item.key === key)?.label || key || "Acción";
}

function renderParticipantProgress(participant, data) {
  const name = `${participant.first_name || ""} ${participant.last_name || ""}`.trim() || "Participante";
  const participantLetter = data.letters.find((item) => item.user_id === participant.id);
  const participantEvidence = data.evidence.filter((item) => item.user_id === participant.id);
  const participantReflections = data.reflections.filter((item) => item.user_id === participant.id);
  const participantMetrics = data.metricRecords.filter((item) => item.user_id === participant.id);
  const participantSupport = data.supportRecords.filter((item) => item.user_id === participant.id);
  const participantTools = data.resourceToolRecords.filter((item) => item.user_id === participant.id);
  const latestMetric = participantMetrics.sort((a, b) => String(b.week).localeCompare(String(a.week), undefined, { numeric: true }))[0];
  const missedMetricWeeks = getVisibleMetricWeeks().filter((week) =>
    week.isPastCompleted &&
    !participantMetrics.some((record) => record.week === week.label)
  ).length;
  const latestEvidence = participantEvidence.sort((a, b) => String(b.week).localeCompare(String(a.week), undefined, { numeric: true }))[0];
  const latestReflection = participantReflections[0];

  const letterStatus = participantLetter?.data?.declaration ? "Carta activa" : "Carta pendiente";
  const evidenceStatus = `${participantEvidence.length} semanas`;
  const reflectionStatus = `${participantReflections.length} reflexiones`;
  const levelsStatus = `${state.serverProgress.completedKeys.length}/6 niveles`;
  const metricStatus = latestMetric ? `${latestMetric.overall || 0}% en ${latestMetric.week}` : "Sin indicadores";

  return `
    <article class="participant-progress-card">
      <div>
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(participant.email || participant.whatsapp || "Sin contacto")}</span>
      </div>
      <div class="progress-pills">
        <small>${escapeHtml(letterStatus)}</small>
        <small>${escapeHtml(evidenceStatus)}</small>
        <small>${escapeHtml(reflectionStatus)}</small>
        <small>${escapeHtml(levelsStatus)}</small>
        <small>${escapeHtml(metricStatus)}</small>
        <small>${missedMetricWeeks} ${missedMetricWeeks === 1 ? "semana sin indicadores" : "semanas sin indicadores"}</small>
        <small>${participantSupport.length} acompañamientos</small>
        <small>${participantTools.length} recursos</small>
      </div>
      <div class="repository-details">
        <p><strong>Carta:</strong> ${escapeHtml(participantLetter?.data?.declaration || "Aun no ha escrito declaracion principal.")}</p>
        <p><strong>Última semana:</strong> ${escapeHtml(latestEvidence?.week || "Sin semana registrada")} · ${escapeHtml(latestEvidence?.weekly_win || "Sin logro observable.")}</p>
        <p><strong>Última reflexión:</strong> ${escapeHtml(latestReflection?.key_moment || "Sin reflexión registrada.")}</p>
      </div>
    </article>
  `;
}

function generateActivationCode() {
  return `VALIOSO-${Math.floor(1000 + Math.random() * 9000)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateLetterSummary() {
  const name = state.letter.name?.trim();
  const declaration = state.letter.declaration?.trim();
  const hasMetric = Boolean(state.letter.today1 || state.letter.target1 || state.letter.proof1);

  if (currentProfile) {
    document.querySelector("#participantName").textContent =
      `${currentProfile.first_name || ""} ${currentProfile.last_name || ""}`.trim() || name || "Participante";
  }
  document.querySelector("#letterStatus").textContent = declaration && hasMetric ? "Activa" : "Pendiente";
}

function flashButton(selector, message) {
  const button = document.querySelector(selector);
  flashButtonSelector(button, message);
}

function flashButtonSelector(button, message) {
  if (!button) return;
  const original = button.textContent;
  button.textContent = message;
  button.disabled = true;
  setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
  }, 1300);
}
