const levelTransitions = [
  { from: "nivel1", to: "nivel2", label: "Valioso → Valiente I" },
  { from: "nivel2", to: "nivel3", label: "Valiente I → Valiente II" },
  { from: "nivel3", to: "nivel4", label: "Valiente II → Poderoso" },
  { from: "nivel4", to: "confianza", label: "Poderoso → Confianza" },
  { from: "confianza", to: "nivel5", label: "Confianza → Supervivencia" },
];

async function initTickets() {
  const createBtn = document.querySelector("#createTicket");
  if (createBtn) {
    createBtn.addEventListener("click", () => {
      const form = document.querySelector("#ticketForm");
      form.hidden = !form.hidden;
      if (!form.hidden) loadTeamForTickets();
    });
  }

  const submitBtn = document.querySelector("#submitTicket");
  if (submitBtn) submitBtn.addEventListener("click", handleCreateTicket);

  await renderTickets();
}

async function loadTeamForTickets() {
  const select = document.querySelector("#ticketParticipant");
  if (!select) return;

  let query = sb.from("profiles").select("id, first_name, last_name").eq("role", "participant");

  if (currentProfile.role === "staff") {
    query = query.eq("staff_id", currentProfile.id);
  }

  const { data: participants } = await query.order("first_name");
  select.innerHTML = participants
    ?.map((p) => `<option value="${p.id}">${p.first_name || ""} ${p.last_name || ""}`.trim() + "</option>")
    .join("") || '<option value="">Sin participantes</option>';
}

async function handleCreateTicket() {
  const participantId = document.querySelector("#ticketParticipant").value;
  const transitionValue = document.querySelector("#ticketTransition").value;
  const title = document.querySelector("#ticketTitle").value.trim();
  const description = document.querySelector("#ticketDesc").value.trim();

  if (!participantId || !title) return;

  const [from_level, to_level] = transitionValue.split("-");
  const btn = document.querySelector("#submitTicket");

  btn.disabled = true;
  btn.textContent = "Asignando...";

  const { error } = await sb.from("tickets").insert({
    title,
    description,
    from_level,
    to_level,
    participant_id: participantId,
    created_by: currentProfile.id,
  });

  if (error) {
    btn.textContent = "Error al crear";
    setTimeout(() => { btn.disabled = false; btn.textContent = "Asignar ticket"; }, 1500);
    return;
  }

  document.querySelector("#ticketTitle").value = "";
  document.querySelector("#ticketDesc").value = "";
  btn.disabled = false;
  btn.textContent = "Asignar ticket";
  document.querySelector("#ticketForm").hidden = true;
  await renderTickets();
}

async function renderTickets() {
  const container = document.querySelector("#ticketList");
  if (!container) return;

  let query;
  if (currentProfile.role === "participant") {
    query = sb.from("tickets").select("*").eq("participant_id", currentProfile.id);
  } else if (currentProfile.role === "staff") {
    query = sb.from("tickets").select("*, profiles!tickets_participant_id_fkey(first_name, last_name)")
      .in("participant_id", await getTeamIds());
  } else {
    query = sb.from("tickets").select("*, profiles!tickets_participant_id_fkey(first_name, last_name)");
  }

  const { data: tickets } = await query.order("created_at", { ascending: false });

  if (!tickets || tickets.length === 0) {
    container.innerHTML = '<p class="empty-state">No hay tickets asignados todavía.</p>';
    return;
  }

  const grouped = {};
  for (const t of tickets) {
    const key = `${t.from_level}-${t.to_level}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  }

  let html = "";
  for (const [key, group] of Object.entries(grouped)) {
    const transition = levelTransitions.find((tr) => `${tr.from}-${tr.to}` === key);
    const label = transition?.label || key;

    html += `<div class="ticket-group">`;
    html += `<h3 class="ticket-group-title">${escapeHtml(label)}</h3>`;
    html += `<div class="ticket-cards">`;

    for (const ticket of group) {
      html += renderTicketCard(ticket);
    }

    html += `</div></div>`;
  }

  container.innerHTML = html;
  bindTicketActions();
}

function renderTicketCard(ticket) {
  const statusLabels = {
    pendiente: "Pendiente",
    completado: "En revisión",
    aprobado: "Aprobado",
  };
  const statusClass = {
    pendiente: "badge-pending",
    completado: "badge-review",
    aprobado: "badge-approved",
  };

  const participantName = ticket.profiles
    ? `${ticket.profiles.first_name || ""} ${ticket.profiles.last_name || ""}`.trim()
    : "";

  let actions = "";

  if (currentProfile.role === "participant" && ticket.status === "pendiente") {
    actions = `
      <div class="ticket-upload" data-ticket-id="${ticket.id}">
        <label class="upload-area">
          <input type="file" accept="image/*" capture="environment" class="ticket-photo-input" />
          <span>Subir foto de evidencia</span>
        </label>
      </div>`;
  }

  if (currentProfile.role !== "participant" && ticket.status === "completado") {
    actions = `
      <div class="ticket-review-actions">
        ${ticket.photo_url ? `<a href="${escapeHtml(ticket.photo_url)}" target="_blank" class="action-link">Ver evidencia</a>` : ""}
        <button class="quiet-button ticket-approve-btn" data-ticket-id="${ticket.id}">Aprobar</button>
      </div>`;
  }

  if (ticket.photo_url && ticket.status !== "pendiente") {
    actions += `<div class="ticket-photo-preview"><img src="${escapeHtml(ticket.photo_url)}" alt="Evidencia" /></div>`;
  }

  return `
    <article class="ticket-card">
      <div class="ticket-header">
        <strong>${escapeHtml(ticket.title)}</strong>
        <span class="ticket-badge ${statusClass[ticket.status]}">${statusLabels[ticket.status]}</span>
      </div>
      ${participantName && currentProfile.role !== "participant" ? `<small class="ticket-participant">${escapeHtml(participantName)}</small>` : ""}
      ${ticket.description ? `<p>${escapeHtml(ticket.description)}</p>` : ""}
      ${actions}
    </article>`;
}

function bindTicketActions() {
  document.querySelectorAll(".ticket-photo-input").forEach((input) => {
    input.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const ticketId = input.closest("[data-ticket-id]").dataset.ticketId;
      const uploadArea = input.closest(".upload-area");
      const span = uploadArea.querySelector("span");
      span.textContent = "Subiendo...";
      input.disabled = true;

      const ext = file.name.split(".").pop();
      const path = `${currentProfile.id}/${ticketId}.${ext}`;

      const { error: uploadError } = await sb.storage
        .from("ticket-photos")
        .upload(path, file, { upsert: true });

      if (uploadError) {
        span.textContent = "Error al subir. Intenta de nuevo.";
        input.disabled = false;
        return;
      }

      const { data: urlData } = await sb.storage
        .from("ticket-photos")
        .createSignedUrl(path, 60 * 60 * 24 * 365);

      await sb.from("tickets").update({
        photo_url: urlData?.signedUrl || path,
        status: "completado",
        completed_at: new Date().toISOString(),
      }).eq("id", ticketId);

      await renderTickets();
      if (typeof renderPendingActivities === "function") await renderPendingActivities();
    });
  });

  document.querySelectorAll(".ticket-approve-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ticketId = btn.dataset.ticketId;
      btn.disabled = true;
      btn.textContent = "Aprobando...";

      await sb.from("tickets").update({
        status: "aprobado",
        reviewed_at: new Date().toISOString(),
      }).eq("id", ticketId);

      await renderTickets();
      if (typeof renderPendingActivities === "function") await renderPendingActivities();
    });
  });
}

async function getTeamIds() {
  const { data } = await sb.from("profiles")
    .select("id")
    .eq("staff_id", currentProfile.id)
    .eq("role", "participant");
  return data?.map((p) => p.id) || [];
}
