const storageKey = "liderazgoPortalState";

const defaultState = {
  metrics: {},
  checks: {},
  letter: {},
  evidence: {},
  reflections: {},
  approvals: {},
  resources: [],
  participants: []
};

const state = loadState();

const levelSchedule = [
  { key: "nivel1", name: "Nivel 1 Valioso", unlock: "2026-07-06T00:00:00-05:00", label: "6 Jul" },
  { key: "nivel2", name: "Nivel 2 Valiente I", unlock: "2026-08-10T00:00:00-05:00", label: "10 Ago" },
  { key: "nivel3", name: "Nivel 3 Valiente II", unlock: "2026-08-31T00:00:00-05:00", label: "31 Ago" },
  { key: "nivel4", name: "Nivel 4 Poderoso", unlock: "2026-09-14T00:00:00-05:00", label: "14 Sep" },
  { key: "confianza", name: "Noche de confianza", unlock: "2026-09-25T00:00:00-05:00", label: "25 Sep" },
  { key: "nivel5", name: "Nivel 5 Supervivencia", unlock: "2026-10-19T00:00:00-05:00", label: "19 Oct" }
];

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return {
      ...defaultState,
      ...saved,
      metrics: saved.metrics || {},
      checks: saved.checks || {},
      letter: saved.letter || {},
      evidence: saved.evidence || {},
      reflections: saved.reflections || {},
      approvals: saved.approvals || {},
      resources: saved.resources || [],
      participants: saved.participants || []
    };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function updateOverall() {
  const ranges = [...document.querySelectorAll(".metric-card input[type='range']")];
  const metricAverage = ranges.reduce((sum, range) => sum + Number(range.value), 0) / ranges.length;
  const checks = [...document.querySelectorAll("[data-check]")];
  const checkAverage = checks.filter((check) => check.checked).length / checks.length * 100;
  const overall = Math.round(metricAverage * 0.7 + checkAverage * 0.3);
  document.querySelector("#overallScore").textContent = `${overall}%`;
  document.querySelector("#overallBar").style.width = `${overall}%`;
  document.querySelector("#completedLevels").textContent = `${checks.filter((check) => check.checked).length}/${checks.length}`;
  const evidenceCount = document.querySelector("#evidenceCount");
  if (evidenceCount) evidenceCount.textContent = Object.keys(state.evidence).length;
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
      state.metrics[key] = range.value;
      saveState();
      updateOverall();
    });
  });
}

function hydrateChecks() {
  document.querySelectorAll("[data-check]").forEach((check) => {
    const key = check.dataset.check;
    check.checked = Boolean(state.checks[key]);
    check.addEventListener("change", () => {
      state.checks[key] = check.checked;
      saveState();
      updateOverall();
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

  saveState();
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
      saveState();
    });
  });

  document.querySelector("#saveLetter").addEventListener("click", () => {
    [...form.elements].forEach((field) => {
      if (field.name) state.letter[field.name] = field.value;
    });
    saveState();
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

  document.querySelector("#saveEvidence").addEventListener("click", () => {
    state.evidence[week.value] = {};
    fields.forEach((field) => {
      state.evidence[week.value][field.id] = field.value;
    });
    saveState();
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

  document.querySelector("#saveReflection").addEventListener("click", () => {
    state.reflections[level.value] = {};
    fields.forEach((field) => {
      state.reflections[level.value][field.id] = field.value;
    });
    state.approvals[level.value] = state.approvals[level.value] || "pendiente";
    saveState();
    updateReflectionStatus();
    renderAdminLists();
    flashButton("#saveReflection", "Reflexión guardada");
  });

  document.querySelector("#approveReflection").addEventListener("click", () => {
    state.approvals[level.value] = "aprobada";
    saveState();
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
  document.querySelector("#saveParticipant").addEventListener("click", () => {
    const participant = {
      firstName: document.querySelector("#participantFirstName").value.trim(),
      lastName: document.querySelector("#participantLastName").value.trim(),
      whatsapp: document.querySelector("#participantWhatsapp").value.trim(),
      email: document.querySelector("#participantEmail").value.trim(),
      cohort: document.querySelector("#participantCohort").value.trim(),
      activationCode: document.querySelector("#activationCode").value.trim(),
      emergencyFirstName: document.querySelector("#emergencyFirstName").value.trim(),
      emergencyLastName: document.querySelector("#emergencyLastName").value.trim(),
      emergencyPhone: document.querySelector("#emergencyPhone").value.trim()
    };

    if (!participant.firstName && !participant.whatsapp) return;

    state.participants.push(participant);
    [
      "participantFirstName",
      "participantLastName",
      "participantWhatsapp",
      "participantEmail",
      "emergencyFirstName",
      "emergencyLastName",
      "emergencyPhone"
    ].forEach((id) => {
      document.querySelector(`#${id}`).value = "";
    });
    document.querySelector("#activationCode").value = generateActivationCode();
    saveState();
    renderAdminLists();
    flashButton("#saveParticipant", "Participante guardado");
  });

  document.querySelector("#saveResource").addEventListener("click", () => {
    const level = document.querySelector("#adminLevel").value;
    const title = document.querySelector("#resourceTitle").value.trim();
    const link = document.querySelector("#resourceLink").value.trim();

    if (!title && !link) return;

    state.resources.push({ level, title: title || "Recurso sin titulo", link });
    document.querySelector("#resourceTitle").value = "";
    document.querySelector("#resourceLink").value = "";
    saveState();
    renderAdminLists();
    flashButton("#saveResource", "Recurso cargado");
  });

  renderAdminLists();
}

function renderAdminLists() {
  const approvals = document.querySelector("#approvalList");
  const participants = document.querySelector("#participantList");
  const resources = document.querySelector("#resourceList");
  const reflectionEntries = Object.entries(state.reflections).filter(([, value]) => Object.values(value).some(Boolean));

  approvals.innerHTML = reflectionEntries.length
    ? reflectionEntries.map(([key, value]) => {
        const label = levelSchedule.find((item) => item.key === key)?.name || key;
        const status = state.approvals[key] === "aprobada" ? "Aprobada" : "Pendiente";
        return `<div class="approval-item"><span>${escapeHtml(label)} · ${status}</span><p>${escapeHtml(value.takeaway || "Sin respuesta en que me llevo.")}</p></div>`;
      }).join("")
    : "<p>No hay reflexiones enviadas todavía.</p>";

  participants.innerHTML = state.participants.length
    ? state.participants.map((item) => {
        const name = `${item.firstName || ""} ${item.lastName || ""}`.trim() || "Participante sin nombre";
        const emergencyName = `${item.emergencyFirstName || ""} ${item.emergencyLastName || ""}`.trim() || "Sin nombre de emergencia";
        return `<div class="approval-item"><span>${escapeHtml(name)} · ${escapeHtml(item.activationCode || "Sin código")}</span><p>WhatsApp: ${escapeHtml(item.whatsapp || "Sin WhatsApp")}<br>Emergencia: ${escapeHtml(emergencyName)} · ${escapeHtml(item.emergencyPhone || "Sin número")}</p></div>`;
      }).join("")
    : "<p>No hay participantes registrados.</p>";

  resources.innerHTML = state.resources.length
    ? state.resources.map((item) => {
        const label = levelSchedule.find((level) => level.key === item.level)?.name || item.level;
        return `<div class="approval-item"><span>${escapeHtml(label)}</span><p><strong>${escapeHtml(item.title)}</strong><br>${escapeHtml(item.link || "Sin enlace adicional.")}</p></div>`;
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

  document.querySelector("#participantName").textContent = name || "Participante";
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
