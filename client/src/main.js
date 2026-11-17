/* =========================================================================
   main.js — Application entry point (SPA shell)
   =========================================================================
   Responsibilities of this file (and ONLY this file):
     1. Register all pages with the router and start it
     2. Wire up the sidebar nav links
     3. Handle global controls — arm/disarm, monitoring toggle, safety banner
     4. Run global polls — connection health, nav badges, safety alert banner
     5. Topbar clock

   WHY SEPARATE GLOBAL FROM PAGE-LEVEL POLLS?
   Each page (dashboard.js, cameras.js, etc.) manages its own polling
   intervals and cleans them up on unmount. Global polls (health, badges)
   live here and run regardless of which page is active. This way the
   connection dot always works even when you're on the Settings page.
   ========================================================================= */

import "./style.css";

import { router }         from "./router.js";
import { DashboardPage }  from "./pages/dashboard.js";
import { CamerasPage }    from "./pages/cameras.js";
import { AlertsPage }     from "./pages/alerts.js";
import { NetworkPage }    from "./pages/network.js";
import { SettingsPage }   from "./pages/settings.js";
import { TrainingPage }   from "./pages/training.js";

import {
  getHealth,
  getLiveStatus,
  getAlerts,
  getSafetyAlerts,
  armSystem,
  disarmSystem,
  getMonitoringSetting,
  setMonitoring,
  getFeedbackStats,
  getAlarm,
  silenceAlarm,
} from "./api.js";

/* ─────────────────────────────────────────────
   Global DOM refs (elements that exist outside the page outlet)
   ───────────────────────────────────────────── */
const el = {
  badge:           document.getElementById("system-badge"),
  armToggle:       document.getElementById("arm-toggle"),
  monToggle:       document.getElementById("monitoring-toggle"),
  connDot:         document.getElementById("conn-dot"),
  connLabel:       document.getElementById("conn-label"),
  safetyBanner:    document.getElementById("safety-banner"),
  safetyText:      document.getElementById("safety-banner-text"),
  safetyDismiss:   document.getElementById("safety-banner-dismiss"),
  navCamBadge:     document.getElementById("nav-badge-cameras"),
  navAlertBadge:   document.getElementById("nav-badge-alerts"),
  navTrainingBadge:document.getElementById("nav-badge-training"),
  clock:           document.getElementById("topbar-clock"),
  menuBtn:         document.getElementById("menu-btn"),
  toastContainer:  document.getElementById("toast-container"),
  sidebar:         document.querySelector(".sidebar"),
  // Alarm panel
  alarmPanel:      document.getElementById("alarm-panel"),
  alarmIcon:       document.getElementById("alarm-icon"),
  alarmTitle:      document.getElementById("alarm-title"),
  alarmDetail:     document.getElementById("alarm-detail"),
  alarmSilenceBtn: document.getElementById("alarm-silence-btn"),
};

/* ─────────────────────────────────────────────
   Global state
   ───────────────────────────────────────────── */
const state = {
  armed:            false,
  monitoringOn:     true,
  lastAlertMessage: null,
  bannerDismissed:  false,
  // Alarm
  alarmActive:      false,
  lastAlarmCategory:null,
  audioCtx:         null,   // Web Audio context (created on first user gesture)
};

/* ─────────────────────────────────────────────
   Router setup
   ───────────────────────────────────────────── */
router
  .register("/",          DashboardPage)
  .register("/cameras",   CamerasPage)
  .register("/alerts",    AlertsPage)
  .register("/network",   NetworkPage)
  .register("/settings",  SettingsPage)
  .register("/training",  TrainingPage)
  .init(document.getElementById("page-outlet"));

// Give the router the nav links so it keeps the active class in sync
router.registerNavLinks(document.querySelectorAll(".nav__link"));

/* ─────────────────────────────────────────────
   Mobile sidebar toggle
   ───────────────────────────────────────────── */
el.menuBtn.addEventListener("click", () => {
  el.sidebar.classList.toggle("sidebar--open");
});
// Close sidebar when a nav link is clicked on mobile
document.querySelectorAll(".nav__link").forEach((a) => {
  a.addEventListener("click", () => el.sidebar.classList.remove("sidebar--open"));
});

/* ─────────────────────────────────────────────
   Clock (topbar, updates every second)
   ───────────────────────────────────────────── */
function updateClock() {
  const now = new Date();
  el.clock.textContent = now.toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
updateClock();
setInterval(updateClock, 1000);

/* ─────────────────────────────────────────────
   Connection status
   ───────────────────────────────────────────── */
function setConnState(status) {
  el.connDot.className = `conn-indicator__dot conn-indicator__dot--${status}`;
  el.connLabel.textContent =
    status === "ok" ? "Connected" : status === "error" ? "Offline" : "Connecting…";
}
async function pollHealth() {
  setConnState("checking");
  try { await getHealth(); setConnState("ok"); }
  catch { setConnState("error"); }
}

/* ─────────────────────────────────────────────
   Arm / Disarm
   ───────────────────────────────────────────── */
function renderArmToggle(armed) {
  state.armed = armed;
  el.badge.textContent = armed ? "ARMED" : "DISARMED";
  el.badge.classList.toggle("badge--armed",    armed);
  el.badge.classList.toggle("badge--disarmed", !armed);
  el.armToggle.textContent = armed ? "Disarm" : "Arm";
  el.armToggle.classList.toggle("btn--disarm", armed);
  el.armToggle.classList.toggle("btn--arm",    !armed);
}

el.armToggle.addEventListener("click", async () => {
  requestNotifPermission();
  _getAudioCtx();   // warm up AudioContext on first user gesture
  el.armToggle.disabled = true;
  try {
    const res = state.armed ? await disarmSystem() : await armSystem();
    renderArmToggle(res.armed);
  } catch (err) { console.error("Arm toggle:", err.message); }
  finally { el.armToggle.disabled = false; }
});

/* ─────────────────────────────────────────────
   Monitoring toggle
   ───────────────────────────────────────────── */
function renderMonToggle(enabled) {
  state.monitoringOn = enabled;
  el.monToggle.textContent = enabled ? "Monitoring On" : "Monitoring Off";
  el.monToggle.className   = `btn btn--sm btn--full ${enabled ? "btn--monitoring-on" : "btn--monitoring-off"}`;
}

el.monToggle.addEventListener("click", async () => {
  el.monToggle.disabled = true;
  try {
    const res = await setMonitoring(!state.monitoringOn);
    renderMonToggle(res.enabled);
  } catch (err) { console.error("Monitoring:", err.message); }
  finally { el.monToggle.disabled = false; }
});

/* ─────────────────────────────────────────────
   ALARM PANEL
   ─────────────────────────────────────────────
   Polls GET /api/alarm every 2 s (faster than other polls).
   When a CRITICAL threat is active:
     • Shows the flashing red alarm panel at the top of the screen
     • Plays a Web Audio beep pattern in the browser tab
     • Fires a browser notification if permission is granted
   The "Silence" button sends POST /api/alarm/silence to stop
   the server-side winsound beep AND hides the panel.

   WHY WEB AUDIO API INSTEAD OF <audio> TAG?
   The Web Audio API works without any audio files — we synthesise beeps
   entirely in code using oscillators. No assets needed, no CORS issues,
   and it works in every modern browser. The AudioContext is created on
   first user gesture (arm button click) to comply with browser autoplay
   policies that block audio before user interaction.
   ───────────────────────────────────────────── */

// Threat category → display config { icon, title, color }
const THREAT_DISPLAY = {
  fire:      { icon: "🔥", title: "FIRE DETECTED",    color: "#ff4444" },
  fight:     { icon: "⚔",  title: "FIGHT DETECTED",   color: "#ff4444" },
  weapon:    { icon: "🔫", title: "WEAPON DETECTED",  color: "#ff4444" },
  intrusion: { icon: "🚨", title: "INTRUSION ALERT",  color: "#f59e0b" },
  default:   { icon: "⚠",  title: "CRITICAL ALERT",   color: "#ff4444" },
};

function _getAudioCtx() {
  // Create AudioContext lazily — must happen after a user gesture
  if (!state.audioCtx) {
    try { state.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return null; }
  }
  // Resume if suspended (browser autoplay policy)
  if (state.audioCtx.state === "suspended") state.audioCtx.resume();
  return state.audioCtx;
}

function _playBeepPattern(category) {
  // WHY OSCILLATORS?
  // We generate tones mathematically — no audio files, no network requests.
  // Different threat categories get distinct tones so you know what the
  // alarm means even without looking at the screen.
  const ctx = _getAudioCtx();
  if (!ctx) return;

  const patterns = {
    fire:      [{ freq: 880, dur: 0.15 }, { freq: 0, dur: 0.05 }],  // rapid high beeps
    fight:     [{ freq: 660, dur: 0.2  }, { freq: 880, dur: 0.2 }],  // alternating
    weapon:    [{ freq: 1047, dur: 0.12}, { freq: 0, dur: 0.08 }],   // sharp triple
    intrusion: [{ freq: 523, dur: 0.3  }, { freq: 0, dur: 0.1  }],   // lower warning
    default:   [{ freq: 660, dur: 0.2  }],
  };

  const seq    = patterns[category] || patterns.default;
  let   offset = ctx.currentTime + 0.05;

  // Repeat the pattern 3 times
  for (let rep = 0; rep < 3; rep++) {
    for (const note of seq) {
      if (note.freq > 0) {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = note.freq;
        osc.type            = "square";
        gain.gain.setValueAtTime(0.3, offset);
        gain.gain.exponentialRampToValueAtTime(0.001, offset + note.dur);
        osc.start(offset);
        osc.stop(offset + note.dur);
      }
      offset += note.dur + (note.freq === 0 ? note.dur : 0.02);
    }
    offset += 0.1;   // gap between repetitions
  }
}

function renderAlarmPanel(alarmState) {
  const active   = alarmState.active && !alarmState.silenced;
  const category = alarmState.category || "default";

  el.alarmPanel.classList.toggle("alarm-panel--hidden", !active);

  if (!active) {
    state.alarmActive = false;
    return;
  }

  // First time this alarm fires — play audio + notification
  if (!state.alarmActive || state.lastAlarmCategory !== category) {
    state.alarmActive      = true;
    state.lastAlarmCategory = category;

    _playBeepPattern(category);

    const disp = THREAT_DISPLAY[category] || THREAT_DISPLAY.default;
    fireNotif(disp.title, `${disp.icon} ${disp.title} — check cameras immediately`, "danger");
  }

  const disp = THREAT_DISPLAY[category] || THREAT_DISPLAY.default;
  el.alarmIcon.textContent   = disp.icon;
  el.alarmTitle.textContent  = disp.title;
  el.alarmDetail.textContent = `Category: ${category.toUpperCase()} · Click Silence to stop audio`;
  el.alarmPanel.style.setProperty("--alarm-color", disp.color);
}

async function pollAlarm() {
  try {
    const data = await getAlarm();
    renderAlarmPanel(data);
  } catch { /* silently ignore — connection indicator covers backend-down */ }
}

// Silence button handler
el.alarmSilenceBtn.addEventListener("click", async () => {
  try {
    await silenceAlarm();
    el.alarmPanel.classList.add("alarm-panel--hidden");
    state.alarmActive = false;
  } catch (err) { console.error("Silence alarm:", err.message); }
});

/* ─────────────────────────────────────────────
   Nav badges — camera online count + alert count
   ───────────────────────────────────────────── */
async function pollNavBadges() {
  try {
    const [live, alerts] = await Promise.all([getLiveStatus(), getAlerts()]);
    renderArmToggle(live.system.armed);
    el.navCamBadge.textContent   = live.online_count > 0 ? live.online_count : "";
    el.navAlertBadge.textContent = alerts.count > 0 ? alerts.count : "";
    // New alert notification
    if (alerts.alerts.length) {
      const latest = alerts.alerts[0];
      if (latest.message !== state.lastAlertMessage) {
        state.lastAlertMessage = latest.message;
        const sev = _alertSev(latest);
        if (sev === "danger" || sev === "critical") fireNotif("⚠ Security Alert",  latest.message, "danger");
        else if (sev === "warning") fireNotif("Motion Detected", latest.message, "warning");
      }
    }
  } catch {}

  // Training badge — show sample count so user knows labels are accumulating
  try {
    const stats = await getFeedbackStats();
    if (el.navTrainingBadge) {
      el.navTrainingBadge.textContent = stats.total > 0 ? stats.total : "";
      el.navTrainingBadge.className   = stats.can_train
        ? "nav__badge nav__badge--ready"
        : "nav__badge";
    }
  } catch {}
}

/* ─────────────────────────────────────────────
   Safety alert banner
   ───────────────────────────────────────────── */
el.safetyDismiss.addEventListener("click", () => {
  state.bannerDismissed = true;
  el.safetyBanner.classList.add("safety-banner--hidden");
});

async function pollSafety() {
  try {
    const data = await getSafetyAlerts();
    if (data.harmful_activity_detected || data.alert_level === "danger") {
      if (!state.bannerDismissed) {
        el.safetyText.textContent = data.message || "Potential harmful activity detected";
        el.safetyBanner.classList.remove("safety-banner--hidden");
      }
    } else {
      if (!state.bannerDismissed) el.safetyBanner.classList.add("safety-banner--hidden");
    }
  } catch {}
}

/* ─────────────────────────────────────────────
   Notifications + toasts
   ───────────────────────────────────────────── */
function requestNotifPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function fireNotif(title, body, sev = "info") {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "/favicon.svg" });
  }
  showToast(title, body, sev);
}

function showToast(title, body, sev = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast--${sev}`;
  const icon = sev === "danger" ? "🚨" : sev === "warning" ? "⚠️" : "ℹ️";
  toast.innerHTML = `
    <span class="toast__icon">${icon}</span>
    <div class="toast__body">
      <div class="toast__title">${title}</div>
      <div class="toast__msg">${body}</div>
    </div>`;
  el.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = "opacity .3s, transform .3s";
    toast.style.opacity    = "0";
    toast.style.transform  = "translateX(20px)";
    setTimeout(() => toast.remove(), 320);
  }, 5000);
}

/* ─────────────────────────────────────────────
   Boot
   ───────────────────────────────────────────── */
async function init() {
  // Load monitoring state
  try {
    const mon = await getMonitoringSetting();
    renderMonToggle(mon.enabled);
  } catch { renderMonToggle(true); }

  // Initial global fetches
  await Promise.allSettled([pollHealth(), pollNavBadges(), pollSafety(), pollAlarm()]);

  // Global intervals (run regardless of active page)
  setInterval(pollHealth,     5000);
  setInterval(pollNavBadges,  3000);
  setInterval(pollSafety,     4000);
  setInterval(pollAlarm,      2000);  // faster poll for alarm responsiveness
}

init();

/* ─────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────── */
function _alertSev(evt) {
  // New enriched event types from backend
  if (evt.type === "critical") return "danger";
  if (evt.type === "danger")   return "danger";
  if (evt.type !== "detection") return "info";
  const m = (evt.message || "").toLowerCase();
  return (m.includes("fire") || m.includes("weapon") || m.includes("fight") ||
          m.includes("harmful") || m.includes("intrusion") || m.includes("violence"))
    ? "danger" : "warning";
}
