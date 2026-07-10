const SUPABASE_URL = "https://rpgagnnhsefwaethszfl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwZ2Fnbm5oc2Vmd2FldGhzemZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MDAxMjcsImV4cCI6MjA5ODM3NjEyN30.YxXpLyJVFhObTmq30UNnpgBOD6cq2ubR1lIYS6A-Z1g";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const CONSENT_VERSION = "liderazgo-ep-2026-07-03";
const CONSENT_PDF_PATH = "consentimiento-informado-liderazgo-es-posible-ep.pdf";

let currentUser = null;
let currentProfile = null;
const ROLE_HIERARCHY = { participant: 0, staff: 1, admin: 2 };

async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await onSession(session);
  } else {
    showLogin();
  }

  sb.auth.onAuthStateChange(async (_event, session) => {
    if (session) await onSession(session);
    else showLogin();
  });
}

async function onSession(session) {
  currentUser = session.user;
  const { data: profile } = await sb.from("profiles").select("*").eq("id", currentUser.id).single();

  if (!profile) {
    showLogin();
    return;
  }

  currentProfile = profile;
  currentProfile.role = normalizeRole(profile.role);
  document.querySelector("#participantName").textContent =
    `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Participante";

  applyRoleVisibility(currentProfile.role);
  hideLogin();
  await initPortal();
  navigateTo(currentProfile.role === "participant" ? "panel" : "staff");
}

function applyRoleVisibility(role) {
  const userLevel = getRoleLevel(role);
  document.body.classList.remove("role-participant", "role-staff", "role-admin");
  document.body.classList.add(`role-${normalizeRole(role)}`);

  document.querySelectorAll("[data-role-min]").forEach((el) => {
    const minLevel = getRoleLevel(el.dataset.roleMin);
    el.classList.toggle("role-hidden", userLevel < minLevel);
    if (userLevel < minLevel) el.classList.remove("section-visible");
  });

  document.querySelectorAll("[data-role-max]").forEach((el) => {
    const maxLevel = getRoleLevel(el.dataset.roleMax);
    el.classList.toggle("role-hidden", userLevel > maxLevel);
    if (userLevel > maxLevel) el.classList.remove("section-visible");
  });

  const logoutArea = document.querySelector(".sidebar-user");
  if (logoutArea) {
    const roleBadge = logoutArea.querySelector(".role-badge");
    if (roleBadge) {
      const labels = { admin: "Admin", staff: "Staff", participant: "Participante" };
      roleBadge.textContent = labels[role] || role;
    }
    const sessionEmail = logoutArea.querySelector(".session-email");
    if (sessionEmail) {
      sessionEmail.textContent = currentUser?.email || "Sin correo";
    }
  }
}

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  return ["participant", "staff", "admin"].includes(value) ? value : "participant";
}

function getRoleLevel(role) {
  return ROLE_HIERARCHY[normalizeRole(role)] ?? 0;
}

function canAccessElement(el) {
  if (!el || !currentProfile) return true;
  const userLevel = getRoleLevel(currentProfile.role);

  if (el.dataset.roleMin && userLevel < getRoleLevel(el.dataset.roleMin)) return false;
  if (el.dataset.roleMax && userLevel > getRoleLevel(el.dataset.roleMax)) return false;

  return true;
}

function canAccessSection(sectionId) {
  if (sectionId === "panel") return true;
  const target = document.querySelector(`#${sectionId}`);
  return canAccessElement(target);
}

function showLogin() {
  document.body.classList.remove("role-participant", "role-staff", "role-admin");
  document.querySelector(".login-overlay").classList.add("visible");
  document.querySelector(".portal-shell").classList.add("auth-hidden");
}

function hideLogin() {
  document.querySelector(".login-overlay").classList.remove("visible");
  document.querySelector(".portal-shell").classList.remove("auth-hidden");
}

function switchLoginTab(tab) {
  document.querySelectorAll(".login-tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".login-panel").forEach((p) => p.classList.remove("active"));
  document.querySelector(`[data-tab="${tab}"]`).classList.add("active");
  document.querySelector(`#login-${tab}`).classList.add("active");
}

async function handleEmailLogin(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.querySelector("[name=email]").value.trim();
  const password = form.querySelector("[name=password]").value;
  const errorEl = form.querySelector(".login-error");
  const btn = form.querySelector("button");

  errorEl.textContent = "";
  btn.disabled = true;
  btn.textContent = "Entrando...";

  const { error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    errorEl.textContent = "Credenciales incorrectas. Intenta de nuevo.";
    btn.disabled = false;
    btn.textContent = "Entrar";
  }
}

async function handleCodeActivation(e) {
  e.preventDefault();
  const form = e.target;
  const code = form.querySelector("[name=code]").value.trim().toUpperCase();
  const email = form.querySelector("[name=email]").value.trim();
  const password = form.querySelector("[name=password]").value;
  const consentAccepted = form.querySelector("[name=consent]").checked;
  const errorEl = form.querySelector(".login-error");
  const btn = form.querySelector("button");

  errorEl.textContent = "";

  if (!code || !email || !password) {
    errorEl.textContent = "Completa todos los campos.";
    return;
  }

  if (!consentAccepted) {
    errorEl.textContent = "Para activar tu cuenta debes aceptar el consentimiento informado.";
    return;
  }

  if (password.length < 6) {
    errorEl.textContent = "La contraseña debe tener al menos 6 caracteres.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Activando...";

  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;

  const { data: signUpData, error: signUpError } = await sb.auth.signUp({
    email,
    password,
    options: { data: { activation_code: code } },
  });

  if (signUpError) {
    if (signUpError.message.includes("already registered")) {
      errorEl.textContent = "Ese correo ya tiene cuenta. Usa un correo nuevo para activar participante o entra por email si ya fue activado.";
    } else {
      errorEl.textContent = signUpError.message;
    }
    btn.disabled = false;
    btn.textContent = "Activar cuenta";
    return;
  }

  if (signUpData?.user) {
    const { data: result } = await sb.rpc("activate_portal_account", {
      p_code: code,
      p_auth_id: signUpData.user.id,
    });

    if (result && !result.success) {
      errorEl.textContent = "Código no válido. Verifica que el acceso haya sido creado por el admin.";
      await sb.auth.signOut();
      btn.disabled = false;
      btn.textContent = "Activar cuenta";
      return;
    }

    const { data: activatedProfile, error: profileError } = await sb.from("profiles")
      .select("id, role, email")
      .eq("id", signUpData.user.id)
      .maybeSingle();

    const activatedRole = normalizeRole(activatedProfile?.role);
    if (profileError || !["participant", "staff", "admin"].includes(activatedRole)) {
      errorEl.textContent = "Este correo no quedó activo en el portal. Usa un correo nuevo o corrige el rol en Supabase.";
      await sb.auth.signOut();
      btn.disabled = false;
      btn.textContent = "Activar cuenta";
      return;
    }

    const consentSaved = await saveConsentAcceptance(signUpData.user.id, {
      email,
      activationCode: code,
    });

    if (!consentSaved) {
      errorEl.textContent = "No pudimos registrar el consentimiento. Intenta de nuevo o avisa al staff.";
      await sb.auth.signOut();
      btn.disabled = false;
      btn.textContent = "Activar cuenta";
    }
  }
}

async function saveConsentAcceptance(userId, metadata) {
  const { data, error } = await sb.rpc("record_consent_acceptance", {
    p_user_id: userId,
    p_consent_version: CONSENT_VERSION,
    p_consent_pdf_path: CONSENT_PDF_PATH,
    p_metadata: metadata,
  });

  return !error && data?.success !== false;
}

async function handleLogout() {
  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
  const sessionEmail = document.querySelector(".session-email");
  if (sessionEmail) sessionEmail.textContent = "Sin sesión";
  if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname);
  }
  showLogin();
}

function navigateTo(sectionId) {
  if (!canAccessSection(sectionId)) {
    sectionId = "panel";
  }

  document.querySelectorAll(".portal-section").forEach((el) => {
    el.classList.remove("section-visible");
  });

  const panelParts = document.querySelectorAll(".workspace-header, .today-grid, .level-message, .sidebar-progress");

  if (sectionId === "panel") {
    panelParts.forEach((el) => (el.style.display = ""));
  } else {
    panelParts.forEach((el) => (el.style.display = "none"));
    const target = document.querySelector(`#${sectionId}`);
    if (target) target.classList.add("section-visible");
  }

  document.querySelectorAll(".side-nav a").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === `#${sectionId}`);
  });

  document.querySelector(".portal-main")?.scrollTo(0, 0);

  if (sectionId === "panel" && window.location.hash) {
    history.replaceState(null, "", window.location.pathname);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".login-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchLoginTab(tab.dataset.tab));
  });

  const emailForm = document.querySelector("#login-email form");
  if (emailForm) emailForm.addEventListener("submit", handleEmailLogin);

  const codeForm = document.querySelector("#login-code form");
  if (codeForm) codeForm.addEventListener("submit", handleCodeActivation);

  const logoutBtn = document.querySelector("#logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);

  document.querySelectorAll(".side-nav a").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      if (!canAccessElement(link)) {
        navigateTo("panel");
        return;
      }
      const id = link.getAttribute("href").replace("#", "");
      navigateTo(id);
    });
  });

  initAuth();
});
