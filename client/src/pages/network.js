/* =========================================================================
   network.js — Network cybersecurity page
   =========================================================================
   Maps to Week 2 of the project schedule (Days 8–11):
     Day 8  → Scapy packet sniffing setup
     Day 9  → Network anomaly detection (SYN flood, port scan, ping flood)
     Day 10 → Camera IP vulnerability assessment
     Day 11 → AI Decision Layer (merge physical + network threat signals)

   This page is FULLY LAID OUT with real panel structure.
   Currently shows "Not connected" state for all panels because the
   backend endpoints (/api/network-status, /api/network-threats, etc.)
   don't exist yet — they'll be built on Days 8–13.

   WHY BUILD THE UI FIRST?
   Building the UI skeleton first means you know exactly what API shape
   you need before writing the backend. Each panel has a comment showing
   which endpoint will power it. This is the "API contract first" approach.

   HOW TO CONNECT EACH PANEL (Day 8–11 instructions):
     1. Add the endpoint to the backend (FastAPI route in app.py)
     2. Add the api.js function for it
     3. Replace the placeholder content in each panel's _render method
        with real data from the API call
   ========================================================================= */

export const NetworkPage = {
  _intervals: [],

  mount(container) {
    container.innerHTML = this._template();
    // When backend is ready, start polling here:
    // this._intervals = [setInterval(() => this._fetchNetworkStatus(), 5000)];
  },

  unmount() {
    this._intervals.forEach(clearInterval);
    this._intervals = [];
  },

  _template() {
    return `
      <div class="page">
        <div class="page__header">
          <h2 class="page__title">Network Security</h2>
          <span class="page__sub">Layer 2 of 2 — Cybersecurity monitoring</span>
        </div>

        <!-- Architecture explanation banner -->
        <div class="info-banner">
          <span class="info-banner__icon">🛡</span>
          <div class="info-banner__body">
            <strong>Two-Layer Security Architecture</strong>
            <p>Layer 1 (Camera AI) detects physical intrusions. Layer 2 (Network) monitors for
            cyber threats — port scans, SYN floods, unauthorized devices, and camera
            vulnerability probes. Both layers report to the same alert pipeline.</p>
          </div>
          <span class="info-banner__badge info-banner__badge--pending">Backend Pending</span>
        </div>

        <div class="network-grid">

          <!-- Panel 1: Network status overview ──────────────────────────
               Will be powered by: GET /api/network-status  (Day 13)
               Returns: { packets_captured, threats_detected, devices_online,
                          anomaly_score, last_scan }
          ─────────────────────────────────────────────────────────────── -->
          <div class="card net-card">
            <div class="card__title">Network Status
              <span class="net-status-dot net-status-dot--offline" id="net-status-dot"></span>
            </div>
            <div class="net-stat-grid">
              <div class="net-stat">
                <div class="net-stat__value" id="net-packets">—</div>
                <div class="net-stat__label">Packets Captured</div>
              </div>
              <div class="net-stat">
                <div class="net-stat__value" id="net-threats">—</div>
                <div class="net-stat__label">Threats Detected</div>
              </div>
              <div class="net-stat">
                <div class="net-stat__value" id="net-devices">—</div>
                <div class="net-stat__label">Devices Online</div>
              </div>
              <div class="net-stat">
                <div class="net-stat__value" id="net-anomaly">—</div>
                <div class="net-stat__label">Anomaly Score</div>
              </div>
            </div>
            ${_pendingPanel("GET /api/network-status", "Day 13 — Add Scapy packet counter endpoint")}
          </div>

          <!-- Panel 2: Threat feed ────────────────────────────────────────
               Will be powered by: GET /api/network-threats  (Day 13)
               Returns: [{ type, source_ip, timestamp, severity, description }]
               Threat types to detect (Day 9):
                 • SYN_FLOOD — excessive TCP SYN packets from one IP
                 • PORT_SCAN — sequential port probing
                 • PING_FLOOD — ICMP flood
                 • ARP_SPOOF — ARP reply from unexpected MAC
          ─────────────────────────────────────────────────────────────── -->
          <div class="card net-card">
            <div class="card__title">Threat Feed</div>
            <div class="net-threat-legend">
              <span class="threat-tag threat-tag--high">HIGH</span> SYN Flood / ARP Spoof
              &nbsp;·&nbsp;
              <span class="threat-tag threat-tag--med">MED</span> Port Scan
              &nbsp;·&nbsp;
              <span class="threat-tag threat-tag--low">LOW</span> Ping Flood
            </div>
            <ul class="feed" id="net-threats-feed">
              <li class="feed__empty">No threats detected.</li>
            </ul>
            ${_pendingPanel("GET /api/network-threats", "Day 9 — Implement anomaly detection rules in Python")}
          </div>

          <!-- Panel 3: Connected devices ─────────────────────────────────
               Will be powered by: GET /api/network-devices  (Day 8)
               Returns: [{ ip, mac, hostname, first_seen, last_seen, trusted }]
               Day 8 task: use Scapy ARP scan to discover devices on subnet
          ─────────────────────────────────────────────────────────────── -->
          <div class="card net-card">
            <div class="card__title">Connected Devices</div>
            <div id="net-devices-list" class="net-device-list">
              <div class="net-pending-row">
                <span class="net-pending-icon">📡</span>
                <div>
                  <div class="net-pending-title">ARP Scan Not Running</div>
                  <div class="net-pending-sub">Day 8: Add Scapy ARP scan to discover all devices on the LAN</div>
                </div>
              </div>
            </div>
            ${_pendingPanel("GET /api/network-devices", "Day 8 — Scapy ARP scan for device discovery")}
          </div>

          <!-- Panel 4: Camera vulnerability assessment ────────────────────
               Will be powered by: GET /api/camera-security  (Day 10)
               Returns: [{ ip, port, service, vulnerability, severity }]
               Day 10 task: scan camera IPs for open ports (80, 554, 8080)
               and detect default credentials / unencrypted streams
          ─────────────────────────────────────────────────────────────── -->
          <div class="card net-card">
            <div class="card__title">Camera Security Scan</div>
            <div class="vuln-checklist" id="vuln-list">
              ${_vulnCheckItem("Port 80 (HTTP)", "Checks for unencrypted admin panel", "pending")}
              ${_vulnCheckItem("Port 554 (RTSP)", "Checks for unauthenticated stream access", "pending")}
              ${_vulnCheckItem("Port 8080 (Alt HTTP)", "Checks for secondary admin interface", "pending")}
              ${_vulnCheckItem("Default credentials", "admin/admin, admin/12345 probe", "pending")}
              ${_vulnCheckItem("RTSP stream auth", "Verifies stream requires password", "pending")}
            </div>
            ${_pendingPanel("GET /api/camera-security", "Day 10 — Port scan + credential check script")}
          </div>

          <!-- Panel 5: AI Decision Layer ──────────────────────────────────
               Day 11: Merge physical threat (camera detection) + network
               threat signals into a single combined risk score.
               Will be powered by: GET /api/threat-level  (Day 11)
               Returns: { physical_score, network_score, combined_score,
                          recommendation }
          ─────────────────────────────────────────────────────────────── -->
          <div class="card net-card net-card--wide">
            <div class="card__title">AI Decision Layer — Combined Threat Assessment</div>
            <div class="threat-meter-row">
              <div class="threat-meter">
                <div class="threat-meter__label">Physical Threat (Camera AI)</div>
                <div class="threat-meter__bar"><div class="threat-meter__fill threat-meter__fill--physical" style="width:0%"></div></div>
                <div class="threat-meter__score" id="physical-score">Awaiting Layer 1</div>
              </div>
              <div class="threat-combiner">+</div>
              <div class="threat-meter">
                <div class="threat-meter__label">Network Threat (Scapy)</div>
                <div class="threat-meter__bar"><div class="threat-meter__fill threat-meter__fill--network" style="width:0%"></div></div>
                <div class="threat-meter__score" id="network-score">Awaiting Layer 2</div>
              </div>
              <div class="threat-combiner">=</div>
              <div class="threat-meter threat-meter--combined">
                <div class="threat-meter__label">Combined Risk Score</div>
                <div class="threat-meter__bar"><div class="threat-meter__fill threat-meter__fill--combined" id="combined-fill" style="width:0%"></div></div>
                <div class="threat-meter__score threat-meter__score--big" id="combined-score">—</div>
              </div>
            </div>
            <div class="threat-recommendation" id="threat-recommendation">
              Connect both detection layers to generate a combined risk assessment.
            </div>
            ${_pendingPanel("GET /api/threat-level", "Day 11 — Implement AI Decision Layer class in Python")}
          </div>

        </div>
      </div>
    `;
  },
};

// ── Template helpers ───────────────────────────────────────────────────────
function _pendingPanel(endpoint, task) {
  return `
    <div class="pending-panel">
      <code class="pending-panel__endpoint">${endpoint}</code>
      <span class="pending-panel__task">${task}</span>
    </div>`;
}

function _vulnCheckItem(name, desc, status) {
  const icon = status === "pass" ? "✔" : status === "fail" ? "✘" : "○";
  const cls  = status === "pass" ? "vuln-item--pass" : status === "fail" ? "vuln-item--fail" : "vuln-item--pending";
  return `
    <div class="vuln-item ${cls}">
      <span class="vuln-item__icon">${icon}</span>
      <div class="vuln-item__body">
        <div class="vuln-item__name">${name}</div>
        <div class="vuln-item__desc">${desc}</div>
      </div>
      <span class="vuln-item__status">${status.toUpperCase()}</span>
    </div>`;
}
