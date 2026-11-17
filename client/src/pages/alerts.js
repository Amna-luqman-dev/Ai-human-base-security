/* =========================================================================
   alerts.js — Full alert history page
   =========================================================================
   Shows all security events with:
     • Filter tabs: All / Danger / Warning / System
     • Full detection history table (all 12 entries, not just last 6)
     • Live refresh indicator
     • Each event shows type badge, message, timestamp

   WHY A FILTER?
   When the system has been running a while the feed gets noisy.
   A filter lets you quickly see only intrusions or only system events
   without scrolling through everything.
   ========================================================================= */

import { getAlerts } from "../api.js";

export const AlertsPage = {
  _intervals:   [],
  _allAlerts:   [],
  _activeFilter: "all",

  mount(container) {
    container.innerHTML = this._template();
    this._bindElements();
    this._fetchAlerts();
    this._intervals = [setInterval(() => this._fetchAlerts(), 3000)];
  },

  unmount() {
    this._intervals.forEach(clearInterval);
    this._intervals = [];
  },

  _template() {
    return `
      <div class="page">
        <div class="page__header">
          <h2 class="page__title">Alerts</h2>
          <span class="page__sub">Full event history · auto-refreshes every 3 s</span>
        </div>

        <!-- Filter tabs + refresh indicator -->
        <div class="filter-bar">
          <div class="filter-tabs">
            <button class="filter-tab filter-tab--active" data-filter="all">All</button>
            <button class="filter-tab" data-filter="danger">🚨 Danger</button>
            <button class="filter-tab" data-filter="warning">⚠ Warning</button>
            <button class="filter-tab" data-filter="info">● System</button>
          </div>
          <span class="refresh-badge" id="alerts-refresh">—</span>
        </div>

        <!-- Two columns: event feed + detection history -->
        <div class="alerts-body">

          <div class="card alerts-card">
            <div class="card__title">Security Events <span id="alerts-count" class="count-badge">0</span></div>
            <ul id="alerts-feed" class="feed alerts-feed">
              <li class="feed__empty">No events yet.</li>
            </ul>
          </div>

          <div class="card alerts-card">
            <div class="card__title">Detection History</div>
            <div id="alerts-history" class="history">
              <p class="history__empty">No detections recorded.</p>
            </div>
          </div>

        </div>
      </div>
    `;
  },

  _bindElements() {
    this._feedEl    = document.getElementById("alerts-feed");
    this._histEl    = document.getElementById("alerts-history");
    this._countEl   = document.getElementById("alerts-count");
    this._refreshEl = document.getElementById("alerts-refresh");

    // Filter tabs
    document.querySelectorAll(".filter-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".filter-tab").forEach((b) =>
          b.classList.remove("filter-tab--active")
        );
        btn.classList.add("filter-tab--active");
        this._activeFilter = btn.dataset.filter;
        this._renderFeed(this._allAlerts);
      });
    });
  },

  async _fetchAlerts() {
    try {
      const data = await getAlerts();
      this._allAlerts = data.alerts;
      this._renderFeed(data.alerts);
      this._renderHistory(data.detection_history);
      // Refresh timestamp
      const now = new Date();
      this._refreshEl.textContent =
        `Updated ${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}:${now.getSeconds().toString().padStart(2,"0")}`;
    } catch (err) {
      console.error("Alerts fetch:", err.message);
    }
  },

  _renderFeed(alerts) {
    // Apply active filter
    const filtered = alerts.filter((evt) => {
      if (this._activeFilter === "all") return true;
      return _alertSev(evt) === this._activeFilter;
    });

    this._countEl.textContent = filtered.length;

    if (!filtered.length) {
      this._feedEl.innerHTML = `<li class="feed__empty">No ${this._activeFilter === "all" ? "" : this._activeFilter + " "}events.</li>`;
      return;
    }

    this._feedEl.innerHTML = filtered.map((evt) => {
      const sev  = _alertSev(evt);
      const icon = sev === "danger" ? "🚨" : sev === "warning" ? "⚠" : "●";
      const sevLabel = sev === "danger" ? "DANGER" : sev === "warning" ? "WARNING" : "SYSTEM";
      return `
        <li class="feed__item feed__item--${sev}">
          <span class="feed__icon feed__icon--${sev}">${icon}</span>
          <div class="feed__body">
            <div class="feed__message">
              <span class="sev-badge sev-badge--${sev}">${sevLabel}</span>
              ${evt.message}
            </div>
            <div class="feed__time">${evt.timestamp}</div>
          </div>
        </li>`;
    }).join("");
  },

  _renderHistory(history) {
    if (!history.length) {
      this._histEl.innerHTML = '<p class="history__empty">No detections recorded.</p>';
      return;
    }
    const rows = [...history].reverse().map((h) => {
      const conf = (h.confidence * 100).toFixed(0);
      const cls  = h.confidence >= 0.65 ? "history__conf--high"
                 : h.confidence >= 0.45 ? "history__conf--med"
                 : "history__conf--low";
      const level = h.threat_level || "LOW";
      const levelCls = level === "CRITICAL" ? "history__threat--critical"
                     : level === "HIGH"     ? "history__threat--high"
                     : level === "MEDIUM"   ? "history__threat--medium"
                     : "";
      return `<tr>
        <td>${h.timestamp}</td>
        <td>${h.camera_id}</td>
        <td class="${cls}">${conf}%</td>
        <td>${levelCls ? `<span class="${levelCls}">${level}</span>` : level}</td>
      </tr>`;
    }).join("");
    this._histEl.innerHTML = `
      <table class="history__table">
        <thead><tr><th>Time</th><th>Camera</th><th>Confidence</th><th>Threat</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  },
};

function _alertSev(evt) {
  if (evt.type === "critical") return "danger";
  if (evt.type === "danger")   return "danger";
  if (evt.type !== "detection") return "info";
  const m = (evt.message || "").toLowerCase();
  return (m.includes("fire") || m.includes("weapon") || m.includes("fight") ||
          m.includes("harmful") || m.includes("intrusion") || m.includes("violence"))
    ? "danger" : "warning";
}
