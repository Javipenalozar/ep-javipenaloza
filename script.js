const levelSchedule = [
  { key: "nivel1", name: "Nivel 1 Valioso", unlock: "2026-07-06T00:00:00-05:00", label: "6 Jul" },
  { key: "nivel2", name: "Nivel 2 Valiente I", unlock: "2026-08-10T00:00:00-05:00", label: "10 Ago" },
  { key: "nivel3", name: "Nivel 3 Valiente II", unlock: "2026-08-31T00:00:00-05:00", label: "31 Ago" },
  { key: "nivel4", name: "Nivel 4 Poderoso", unlock: "2026-09-14T00:00:00-05:00", label: "14 Sep" },
  { key: "confianza", name: "Noche de confianza", unlock: "2026-09-25T00:00:00-05:00", label: "25 Sep" },
  { key: "nivel5", name: "Nivel 5 Supervivencia", unlock: "2026-10-19T00:00:00-05:00", label: "19 Oct" },
];

let state = {
  metrics: {},
  checks: {},
  letter: {},
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
}

async function loadStateFromSupabase() {
  const userId = currentUser.id;

  const [metricsRes, checksRes, letterRes, evidenceRes, reflectionsRes] = await Promise.all([
    sb.from("metrics").select("metric_key, value").eq("user_id", userId),
    sb.from("level_checks").select("level_key, completed").eq("user_id", userId),
    sb.from("letters").select("data").eq("user_id", userId).maybeSingle(),
    sb.from("evidence").select("week, weekly_win, weekly_learning, weekly_challenge").eq("user_id", userId),
    sb.from("reflections").select("level_key, takeaway, key_moment, decision, staff_evidence, approval_status").eq("user_id", userId),
  ]);

  state.metrics = {};
  (metricsRes.data || []).forEach((m) => { state.metrics[m.metric_key] = m.value; });

  state.checks = {};
  (checksRes.data || []).forEach((c) => { state.checks[c.level_key] = c.completed; });

  state.letter = letterRes.data?.data || {};

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

function updateOverall() {
  const ranges = [...document.querySelectorAll(".metric-card input[type='range']")];
  const metricAverage = ranges.reduce((sum, range) => sum + Number(range.value), 0) / ranges.length;
  const checks = [...document.querySelectorAll("[data-check]")];
  const checkAverage = (checks.filter((c) => c.checked).length / checks.length) * 100;
  const overall = Math.round(metricAverage * 0.7 + checkAverage * 0.3);
  document.querySelector("#overallScore").textContent = `${overall}%`;
  document.querySelector("#overallBar").style.width = `${overall}%`;
  document.querySelector("#completedLevels").textContent = `${checks.filter((c) => c.checked).length}/${checks.length}`;
}

function hydrateMetrics() {
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
}

function hydrateChecks() {
  document.querySelectorAll("[data-check]").forEach((check) => {
    const key = check.dataset.check;
    check.checked = Boolean(state.checks[key]);

    check.addEventListener("change", () => {
      state.checks[key] = check.checked;
      updateOverall();
      sb.from("level_checks").upsert({
        user_id: currentUser.id,
        level_key: key,
        completed: check.checked,
      }, { onConflict: "user_id,level_key" });
    });
  });
}

function applyLevelUnlocks() {
  const now = new Date();

  document.querySelectorAll("[data-unlock]").forEach((row) => {
    const unlockDate = new Date(`${row.dataset.unlock}T00:00:00-05:00`);
    const check = row.querySelector("[data-check]");
    const isUnlocked = now >= unlockDate;

    row.classList.toggle("is-unlocked", isUnlocked);
    row.classList.toggle("is-locked", !isUnlocked);
    check.disabled = !isUnlocked;

    if (!isUnlocked) {
      check.checked = false;
      state.checks[check.dataset.check] = false;
    }
  });

  const nextLevel = levelSchedule.find((level) => now < new Date(level.unlock));
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
  const valiosoUnlock = new Date(levelSchedule.find((level) => level.key === "nivel1").unlock);
  valiosoMessage.hidden = new Date() < valiosoUnlock;
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

    await sb.from("letters").upsert({
      user_id: currentUser.id,
      data: state.letter,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    flashButton("#saveLetter", "Carta guardada");
  });

  document.querySelector("#printLetter").addEventListener("click", () => window.print());
  updateLetterSummary();
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

  function renderReflection() {
    const saved = state.reflections[level.value] || {};
    fields.forEach((field) => {
      field.value = saved[field.id] || "";
    });
    updateReflectionStatus();
  }

  level.addEventListener("change", renderReflection);

  document.querySelector("#saveReflection").addEventListener("click", async () => {
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
    renderAdminLists();
    flashButton("#saveReflection", "Reflexión guardada");
  });

  document.querySelector("#approveReflection").addEventListener("click", async () => {
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
}

function updateReflectionStatus() {
  const level = document.querySelector("#reflectionLevel").value;
  const saved = state.reflections[level];
  const status = state.approvals[level];
  const label = levelSchedule.find((item) => item.key === level)?.name || level;
  const summary = document.querySelector("#reflectionStatus");

  if (!saved || !Object.values(saved).some(Boolean)) {
    summary.textContent = "Sin reflexión guardada para este nivel.";
    return;
  }

  summary.textContent = `${label}: ${status === "aprobada" ? "aprobada por staff" : "pendiente de aprobación"}. Momento clave: ${saved.keyMoment || "por completar"}`;
}

function hydrateAdmin() {
  document.querySelector("#saveParticipant").addEventListener("click", async () => {
    const firstName = document.querySelector("#participantFirstName").value.trim();
    const lastName = document.querySelector("#participantLastName").value.trim();
    const whatsapp = document.querySelector("#participantWhatsapp").value.trim();
    const email = document.querySelector("#participantEmail").value.trim();
    const cohort = document.querySelector("#participantCohort").value.trim();
    const code = document.querySelector("#activationCode").value.trim();
    const emergencyFirstName = document.querySelector("#emergencyFirstName").value.trim();
    const emergencyLastName = document.querySelector("#emergencyLastName").value.trim();
    const emergencyPhone = document.querySelector("#emergencyPhone").value.trim();

    if (!firstName && !whatsapp) return;

    const { error } = await sb.rpc("preregister_participant", {
      p_first_name: firstName,
      p_last_name: lastName,
      p_whatsapp: whatsapp,
      p_email: email,
      p_cohort: cohort,
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
    renderAdminLists();
    flashButton("#saveParticipant", "Participante guardado");
  });

  document.querySelector("#saveResource").addEventListener("click", async () => {
    const levelKey = document.querySelector("#adminLevel").value;
    const title = document.querySelector("#resourceTitle").value.trim();
    const link = document.querySelector("#resourceLink").value.trim();

    if (!title && !link) return;

    await sb.from("resources").insert({
      level_key: levelKey,
      title: title || "Recurso sin titulo",
      link,
      created_by: currentProfile.id,
    });

    document.querySelector("#resourceTitle").value = "";
    document.querySelector("#resourceLink").value = "";
    renderAdminLists();
    flashButton("#saveResource", "Recurso cargado");
  });

  renderAdminLists();
}

async function renderAdminLists() {
  if (currentProfile.role === "participant") return;

  const approvals = document.querySelector("#approvalList");
  const participants = document.querySelector("#participantList");
  const resources = document.querySelector("#resourceList");

  let reflQuery = sb.from("reflections").select("*, profiles!inner(first_name, last_name)");
  let pendingQuery = sb.from("pending_participants").select("*");
  let activeQuery = sb.from("profiles").select("*").eq("role", "participant");
  const resQuery = sb.from("resources").select("*").order("created_at", { ascending: false });

  if (currentProfile.role === "staff") {
    pendingQuery = pendingQuery.eq("staff_id", currentProfile.id);
    activeQuery = activeQuery.eq("staff_id", currentProfile.id);
  }

  const [reflRes, pendingRes, activeRes, resRes] = await Promise.all([
    reflQuery,
    pendingQuery.order("created_at", { ascending: false }),
    activeQuery.order("created_at", { ascending: false }),
    resQuery,
  ]);

  const partData = [
    ...(pendingRes.data || []).map((p) => ({ ...p, _pending: true })),
    ...(activeRes.data || []).map((p) => ({ ...p, _pending: false })),
  ];

  const reflections = (reflRes.data || []).filter((r) =>
    r.takeaway || r.key_moment || r.decision || r.staff_evidence
  );

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
        return `<div class="approval-item"><span>${escapeHtml(label)}</span><p><strong>${escapeHtml(r.title)}</strong><br>${escapeHtml(r.link || "Sin enlace.")}</p></div>`;
      }).join("")
    : "<p>No hay recursos cargados.</p>";
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
  const original = button.textContent;
  button.textContent = message;
  button.disabled = true;
  setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
  }, 1300);
}
