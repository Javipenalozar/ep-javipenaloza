const SUPABASE_URL = "https://rpgagnnhsefwaethszfl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwZ2Fnbm5oc2Vmd2FldGhzemZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MDAxMjcsImV4cCI6MjA5ODM3NjEyN30.YxXpLyJVFhObTmq30UNnpgBOD6cq2ubR1lIYS6A-Z1g";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;

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
  document.querySelector("#participantName").textContent =
    `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Participante";

  applyRoleVisibility(profile.role);
  hideLogin();
  await initPortal();
  navigateTo("panel");
}

function applyRoleVisibility(role) {
  const roleHierarchy = { participant: 0, staff: 1, admin: 2 };
  const userLevel = roleHierarchy[role] ?? 0;

  document.querySelectorAll("[data-role-min]").forEach((el) => {
    const minLevel = roleHierarchy[el.dataset.roleMin] ?? 0;
    el.classList.toggle("role-hidden", userLevel < minLevel);
  });

  const logoutArea = document.querySelector(".sidebar-user");
  if (logoutArea) {
    const roleBadge = logoutArea.querySelector(".role-badge");
    if (roleBadge) {
      const labels = { admin: "Admin", staff: "Staff", participant: "Participante" };
      roleBadge.textContent = labels[role] || role;
    }
  }
}

function showLogin() {
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
  const errorEl = form.querySelector(".login-error");
  const btn = form.querySelector("button");

  errorEl.textContent = "";

  if (!code || !email || !password) {
    errorEl.textContent = "Completa todos los campos.";
    return;
  }

  if (password.length < 6) {
    errorEl.textContent = "La contraseña debe tener al menos 6 caracteres.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Activando...";

  const { data: signUpData, error: signUpError } = await sb.auth.signUp({
    email,
    password,
    options: { data: { activation_code: code } },
  });

  if (signUpError) {
    if (signUpError.message.includes("already registered")) {
      errorEl.textContent = "Ese correo ya tiene cuenta. Usa la pestaña de email para entrar.";
    } else {
      errorEl.textContent = signUpError.message;
    }
    btn.disabled = false;
    btn.textContent = "Activar cuenta";
    return;
  }

  if (signUpData?.user) {
    const { data: result } = await sb.rpc("activate_participant", {
      p_code: code,
      p_auth_id: signUpData.user.id,
    });

    if (result && !result.success) {
      errorEl.textContent = "Código no válido. Verifica con tu staff.";
      await sb.auth.signOut();
      btn.disabled = false;
      btn.textContent = "Activar cuenta";
      return;
    }
  }
}

async function handleLogout() {
  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
  showLogin();
}

function navigateTo(sectionId) {
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
      const id = link.getAttribute("href").replace("#", "");
      navigateTo(id);
    });
  });

  initAuth();
});
