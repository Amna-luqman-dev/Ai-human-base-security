/* =========================================================================
   dashboard.js — System overview page
   =========================================================================
   This page answers the question: "Is everything OK right now?"
   It shows:
     • 4 stat cards  — online cameras, total alerts, detection count, uptime
     • System status strip — armed/disarmed, monitoring, camera ready
     • AI summary box — the backend-generated text from GET /summary
     • Recent activity feed — last 5 events from GET /api/alerts
     • Detection history table — from GET /api/alerts detection_history

   WHY NO LIVE CAMERA HERE?
   Dashboards are for quick scanning. Live video demands attention and
   bandwidth. If you need the feed, go to the Cameras page. This keeps the
   dashboard fast and readable.
   ========================================================================= */

import { getLiveStatus, getAlerts, getSummary } from "../api.js";

export const DashboardPage = {
  _intervals: [],

  mount(container) {
    container.innerHTML = this._template();
    this._bindElements();
    this._fetchAll();
    // Poll at comfortable rates — this page doesn't need sub-second updates
    this._intervals = [
      setInterval(() => this._fetchAll(), 4000),
    ];
  },

  unmount() {
    // IMPORTANT: always clear intervals on unmount so they don't pile up
    // when the user navigates back to this page
    this._intervals.forEach(clearInterval);
    this._intervals = [];
  },

  _template() {
    return `
      <div class="page">
        <div class="page__header">
          <h2 class="page__title">Dashboard</h2>
          <span class="page__sub">System overview</span>
        </div>

        <!-- ── Stat cards ── -->
        <div class="stat-row">
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--blue">📷</div>
            <div class="stat-card__body">
              <div class="stat-card__value" id="dash-online-cameras">—</div>
              <div class="stat-card__label">Cameras Online</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--red">🚨</div>
            <div class="stat-card__body">
              <div class="stat-card__value" id="dash-alert-count">—</div>
              <div class="stat-card__label">Active Alerts</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--amber">👁</div>
            <div class="stat-card__body">
              <div class="stat-card__value" id="dash-detection-count">—</div>
              <div class="stat-card__label">Detections</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--green">✔</div>
            <div class="stat-card__body">
              <div class="stat-card__value" id="dash-system-mode">—</div>
              <div class="stat-card__label">System Mode</div>
            </div>
          </div>
        </div>

        <!-- ── Two-column body ── -->
        <div class="dash-body">

          <!-- Left: status + AI summary -->
          <div class="dash-col">

            <div class="card">
              <div class="card__title">System Status</div>
              <div class="status-strip" id="dash-status-strip">
                <div class="status-strip__item">
                  <span class="status-strip__dot" id="dot-armed"></span>
                  <span class="status-strip__label">Armed</span>
                  <span class="status-strip__val" id="val-armed">—</span>
                </div>
                <div class="status-strip__item">
                  <span class="status-strip__dot" id="dot-monitoring"></span>
                  <span class="status-strip__label">Monitoring</span>
                  <span class="status-strip__val" id="val-monitoring">—</span>
                </div>
                <div class="status-strip__item">
                  <span class="status-strip__dot" id="dot-camera"></span>
                  <span class="status-strip__label">Camera</span>
                  <span class="status-strip__val" id="val-camera">—</span>
                </div>
                <div class="status-strip__item">
                  <span class="status-strip__dot"></span>
                  <span class="status-strip__label">Last Detection</span>
                  <span class="status-strip__val status-strip__val--dim" id="val-last-det">—</span>
                </div>
              </div>
            </div>

            <div class="card" style="margin-top:10px; flex:1;">
              <div class="card__title">AI Summary</div>
              <p class="ai-text" id="dash-ai-summary">Loading…</p>
              <div class="tag-row" style="margin-top:10px;">
                <span class="tag" id="dash-ai-model"></span>
                <span class="tag tag--accent" id="dash-safety-tag"></span>
              </div>
            </div>

          </div>

          <!-- Right: recent activity -->
          <div class="dash-col">

            <div class="card" style="flex:1; min-height:0;">
              <div class="card__title">Recent Activity</div>
              <ul class="feed" id="dash-feed">
                <li class="feed__empty">No activity yet.</li>
              </ul>
            </div>

            <div class="card" style="margin-top:10px;">
              <div class="card__title">Detection History</div>
              <div id="dash-history" class="history">
                <p class="history__empty">No detections recorded.</p>
              </div>
            </div>

          </div>

        </div>
      </div>
    `;
  },

  _bindElements() {
    this._el = {
      onlineCameras:  document.getElementById("dash-online-cameras"),
      alertCount:     document.getElementById("dash-alert-count"),
      detectionCount: document.getElementById("dash-detection-count"),
      systemMode:     document.getElementById("dash-system-mode"),
      dotArmed:       document.getElementById("dot-armed"),
      dotMonitoring:  document.getElementById("dot-monitoring"),
      dotCamera:      document.getElementById("dot-camera"),
      valArmed:       document.getElementById("val-armed"),
      valMonitoring:  document.getElementById("val-monitoring"),
      valCamera:      document.getElementById("val-camera"),
      valLastDet:     document.getElementById("val-last-det"),
      aiSummary:      document.getElementById("dash-ai-summary"),
      aiModel:        document.getElementById("dash-ai-model"),
      safetyTag:      document.getElementById("dash-safety-tag"),
      feed:           document.getElementById("dash-feed"),
      history:        document.getElementById("dash-history"),
    };
  },

  async _fetchAll() {
    try {
      const [live, alerts, summary] = await Promise.all([
        getLiveStatus(), getAlerts(), getSummary(),
      ]);
      this._renderLive(live);
      this._renderAlerts(alerts);
      this._renderSummary(summary);
    } catch (err) {
      console.error("Dashboard fetch:", err.message);
    }
  },

  _renderLive(live) {
    const s = live.system;
    const el = this._el;

    el.onlineCameras.textContent  = live.online_count;
    el.systemMode.textContent     = s.armed ? "ARMED" : "DISARMED";
    el.systemMode.style.color     = s.armed ? "var(--armed)" : "var(--online)";

    const dot = (id, on) => {
      document.getElementById(id).className =
        "status-strip__dot " + (on ? "status-strip__dot--on" : "");
    };
    dot("dot-armed",      s.armed);
    dot("dot-monitoring", s.monitoring_enabled);
    dot("dot-camera",     s.camera_ready);

    el.valArmed.textContent      = s.armed              ? "Yes" : "No";
    el.valMonitoring.textContent = s.monitoring_enabled ? "On"  : "Off";
    el.valCamera.textContent     = s.camera_ready       ? "Ready" : "Offline";
    el.valLastDet.textContent    = s.last_detection     || "None";
  },

  _renderAlerts(data) {
    const el = this._el;
    // Stat cards
    el.alertCount.textContent     = data.count;
    el.detectionCount.textContent = data.detection_history.length;

    // Recent feed (last 5)
    const recent = data.alerts.slice(0, 5);
    if (!recent.length) {
      el.feed.innerHTML = '<li class="feed__empty">No activity yet.</li>';
    } else {
      el.feed.innerHTML = recent.map((evt) => {
        const sev  = _alertSev(evt);
        const icon = sev === "danger" ? "🚨" : sev === "warning" ? "⚠" : "●";
        return `
          <li class="feed__item feed__item--${sev}">
            <span class="feed__icon feed__icon--${sev}">${icon}</span>
            <div class="feed__body">
              <div class="feed__message">${evt.message}</div>
              <div class="feed__time">${evt.timestamp}</div>
            </div>
          </li>`;
      }).join("");
    }

    // History table (last 6)
    const hist = [...data.detection_history].reverse().slice(0, 6);
    if (!hist.length) {
      el.history.innerHTML = '<p class="history__empty">No detections recorded.</p>';
    } else {
      const rows = hist.map((h) => {
        const conf = (h.confidence * 100).toFixed(0);
        const cls  = h.confidence >= 0.65 ? "history__conf--high"
                   : h.confidence >= 0.45 ? "history__conf--med"
                   : "history__conf--low";
        return `<tr>
          <td>${h.timestamp}</td>
          <td>${h.camera_id}</td>
          <td class="${cls}">${conf}%</td>
        </tr>`;
      }).join("");
      el.history.innerHTML = `
        <table class="history__table">
          <thead><tr><th>Time</th><th>Camera</th><th>Confidence</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }
  },

  _renderSummary(data) {
    const el = this._el;
    el.aiSummary.textContent = data.ai_summary || "No summary available.";
    el.aiModel.textContent   = data.ai_model   || "";
    const sm = data.safety_model;
    el.safetyTag.textContent = sm?.available
      ? `Safety: ${sm.supported_labels.join(", ")}`
      : "Safety: demo mode";
  },
};

function _alertSev(evt) {
  if (evt.type !== "detection") return "info";
  const m = (evt.message || "").toLowerCase();
  return (m.includes("harmful") || m.includes("intrusion") || m.includes("violence"))
    ? "danger" : "warning";
}
