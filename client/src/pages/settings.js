/* =========================================================================
   settings.js — System configuration page  (per-camera ROI panels)
   =========================================================================
   Layout:
     Left column  → one ROI panel per camera (live frame + sliders)
     Right column → System Controls, Camera Sources, System Info

   HOW PER-CAMERA ROI WORKS:
   Each camera panel shows the live camera frame as the canvas background.
   The cyan/teal overlay (drawn by drawROIOverlay) updates in real-time as
   you drag the sliders. When you click Save the values go to localStorage
   via roiStore.set(). The Cameras page reads those values and draws the
   overlay on every tile and in the zoom modal.

   The .env output block at the bottom shows the backend-format values for
   whichever camera panel you last saved — useful if you want to also align
   the backend's global zone with your frontend zone.

   WHY ONE PANEL PER CAMERA instead of a dropdown?
   You can compare all three zones side-by-side and set them without
   switching back and forth. Each camera has a completely different field
   of view so they need completely independent zones.
   ========================================================================= */

import {
  getLiveStatus,
  getSummary,
  getMonitoringSetting,
  setMonitoring,
  armSystem,
  disarmSystem,
  getCameraFrame,
} from "../api.js";
import { roiStore, drawROIOverlay } from "../roi.js";

export const SettingsPage = {
  _intervals:  [],
  _armed:      false,
  _monitoring: true,
  _cameras:    [],             // camera list from /api/live-status
  _frameTimers:{},             // per-camera frame poll timers

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  mount(container) {
    container.innerHTML = this._template();
    this._bindStaticElements();
    this._fetchState();
    // Poll system state every 5 s; camera frames are polled per-panel
    this._intervals = [setInterval(() => this._fetchState(), 5000)];
  },

  unmount() {
    this._intervals.forEach(clearInterval);
    this._intervals = [];
    // Stop all per-camera frame pollers
    Object.values(this._frameTimers).forEach(clearInterval);
    this._frameTimers = {};
  },

  // ── Template ─────────────────────────────────────────────────────────────
  // The right column is static; the left column (#roi-panels) is populated
  // dynamically once we have the camera list from the backend.
  _template() {
    return `
      <div class="page">
        <div class="page__header">
          <h2 class="page__title">Settings</h2>
          <span class="page__sub">Per-camera restricted zones · System configuration</span>
        </div>

        <div class="settings-grid">

          <!-- ── LEFT: Per-camera ROI panels ──────────────────────────── -->
          <div id="roi-panels" class="roi-panels-col">
            <div class="settings-loading-msg">Loading cameras…</div>
          </div>

          <!-- ── RIGHT: Controls + Info ────────────────────────────────── -->
          <div class="settings-col">

            <!-- System Controls -->
            <div class="card settings-card">
              <div class="card__title">System Controls</div>
              <div class="control-row">
                <div class="control-row__label">
                  <strong>Armed State</strong>
                  <span class="control-row__sub">Arms or disarms the detection system</span>
                </div>
                <button id="settings-arm-btn" class="btn btn--arm">Arm System</button>
              </div>
              <div class="control-row" style="margin-top:12px;">
                <div class="control-row__label">
                  <strong>Monitoring</strong>
                  <span class="control-row__sub">Pause alerts without disarming</span>
                </div>
                <button id="settings-mon-btn" class="btn btn--monitoring-on">Monitoring On</button>
              </div>
            </div>

            <!-- Camera Sources -->
            <div class="card settings-card" style="margin-top:10px;">
              <div class="card__title">Camera Sources</div>
              <p class="settings-desc">
                Sources are set in <code>.env</code>. Use a number for webcam index,
                an RTSP URL for IP cameras, or <code>disabled</code> to skip.
              </p>
              <div id="settings-cameras" class="settings-camera-list">
                <div class="settings-loading">Loading…</div>
              </div>
            </div>

            <!-- .env output for backend global zone -->
            <div class="card settings-card" style="margin-top:10px;" id="env-output-card">
              <div class="card__title">
                Backend Global Zone
                <span style="font-size:.65rem;color:var(--text-faint);font-weight:400;text-transform:none;letter-spacing:0">
                  — copy into .env &amp; restart backend
                </span>
              </div>
              <p class="settings-desc" style="margin-bottom:8px;">
                Hit <strong>Save</strong> on any camera panel below to update these values.
                The backend zone is applied to <em>all</em> cameras server-side.
              </p>
              <pre id="global-env-text" class="env-pre">ROI_X=0.05
ROI_Y=0.06
ROI_W=0.17
ROI_H=0.22
ROI_PROXIMITY_PX=15</pre>
            </div>

            <!-- System Info -->
            <div class="card settings-card" style="margin-top:10px;">
              <div class="card__title">System Info</div>
              <div class="info-table">
                <div class="info-row"><span class="info-row__key">AI Model</span>    <span class="info-row__val" id="info-model">—</span></div>
                <div class="info-row"><span class="info-row__key">Safety Model</span><span class="info-row__val" id="info-safety">—</span></div>
                <div class="info-row"><span class="info-row__key">Online Cams</span> <span class="info-row__val" id="info-cams">—</span></div>
                <div class="info-row"><span class="info-row__key">System Mode</span> <span class="info-row__val" id="info-mode">—</span></div>
                <div class="info-row"><span class="info-row__key">Backend</span>     <span class="info-row__val">FastAPI + Uvicorn</span></div>
                <div class="info-row"><span class="info-row__key">Frontend</span>    <span class="info-row__val">Vite + Vanilla JS</span></div>
                <div class="info-row"><span class="info-row__key">Detection</span>   <span class="info-row__val">YOLOv8n (COCO)</span></div>
              </div>
            </div>

          </div>
        </div>
      </div>
    `;
  },

  // ── Static element binding (right column buttons) ─────────────────────────
  _bindStaticElements() {
    document.getElementById("settings-arm-btn").addEventListener("click", async () => {
      const btn = document.getElementById("settings-arm-btn");
      btn.disabled = true;
      try {
        const res = this._armed ? await disarmSystem() : await armSystem();
        this._armed = res.armed;
        this._updateArmButton();
      } catch (e) { console.error(e); }
      finally { btn.disabled = false; }
    });

    document.getElementById("settings-mon-btn").addEventListener("click", async () => {
      const btn = document.getElementById("settings-mon-btn");
      btn.disabled = true;
      try {
        const res = await setMonitoring(!this._monitoring);
        this._monitoring = res.enabled;
        this._updateMonButton();
      } catch (e) { console.error(e); }
      finally { btn.disabled = false; }
    });
  },

  // ── Fetch system state ────────────────────────────────────────────────────
  async _fetchState() {
    try {
      const [live, summary, mon] = await Promise.all([
        getLiveStatus(), getSummary(), getMonitoringSetting(),
      ]);
      this._armed      = live.system.armed;
      this._monitoring = mon.enabled;
      this._updateArmButton();
      this._updateMonButton();
      this._renderCameraSourceList(live.cameras);
      this._renderInfo(summary, live);

      // Build ROI panels on first load or if camera list changed
      const newIds = live.cameras.map((c) => c.id).join(",");
      if (newIds !== this._cameras.map((c) => c.id).join(",")) {
        this._cameras = live.cameras;
        this._buildROIPanels(live.cameras);
      }
    } catch (err) { console.error("Settings fetch:", err.message); }
  },

  // ── Build one ROI panel per camera ────────────────────────────────────────
  _buildROIPanels(cameras) {
    // Stop any existing frame pollers before rebuilding
    Object.values(this._frameTimers).forEach(clearInterval);
    this._frameTimers = {};

    const col = document.getElementById("roi-panels");
    if (!col) return;

    if (!cameras.length) {
      col.innerHTML = `<div class="settings-loading-msg">No cameras configured.</div>`;
      return;
    }

    col.innerHTML = cameras.map((cam) => this._roiPanelHTML(cam)).join("");

    // Wire up sliders + buttons for every panel
    cameras.forEach((cam) => this._bindROIPanel(cam));
  },

  // ── HTML for one camera's ROI panel ──────────────────────────────────────
  _roiPanelHTML(cam) {
    const roi        = roiStore.get(cam.id);
    const hasCustom  = roiStore.hasCustom(cam.id);
    const statusCls  = cam.online ? "online" : "offline";
    const statusText = cam.online ? "Online" : "Offline";

    return `
      <div class="card roi-panel" id="roi-panel-${cam.id}" data-camera-id="${cam.id}">

        <!-- Panel header -->
        <div class="roi-panel__header">
          <span class="cam-tile__dot cam-tile__dot--${statusCls}" style="width:9px;height:9px;border-radius:50%;"></span>
          <span class="roi-panel__name">${cam.name}</span>
          <span class="roi-panel__zone">${cam.zone}</span>
          <span class="roi-panel__status roi-panel__status--${statusCls}">${statusText}</span>
          ${hasCustom
            ? `<span class="roi-custom-badge">Custom ROI</span>`
            : `<span class="roi-default-badge">Default ROI</span>`}
        </div>

        <!-- Canvas preview — live camera frame with ROI drawn on top -->
        <div class="roi-canvas-wrap">
          <canvas id="roi-canvas-${cam.id}" class="roi-canvas-live"></canvas>
          <div class="roi-canvas-offline ${cam.online ? "roi-canvas-offline--hidden" : ""}"
               id="roi-offline-${cam.id}">
            <span>📷</span><span>Camera offline — sliders still work</span>
          </div>
        </div>

        <!-- Sliders -->
        <div class="roi-sliders">
          ${_sliderHTML(cam.id, "x",    "Left (X)",      roi.x * 100,    0,   90, "%")}
          ${_sliderHTML(cam.id, "y",    "Top (Y)",       roi.y * 100,    0,   90, "%")}
          ${_sliderHTML(cam.id, "w",    "Width (W)",     roi.w * 100,    2,  100, "%")}
          ${_sliderHTML(cam.id, "h",    "Height (H)",    roi.h * 100,    2,  100, "%")}
          ${_sliderHTML(cam.id, "prox", "Proximity",     roi.prox,       0,  150, "px")}
        </div>

        <!-- Actions row -->
        <div class="roi-actions">
          <button class="btn btn--save-roi"  id="roi-save-${cam.id}"  data-id="${cam.id}">
            💾 Save Zone
          </button>
          <button class="btn btn--reset-roi" id="roi-reset-${cam.id}" data-id="${cam.id}">
            ↺ Reset to Default
          </button>
        </div>

        <!-- Save confirmation -->
        <div class="roi-saved-msg roi-saved-msg--hidden" id="roi-saved-${cam.id}"></div>

      </div>`;
  },

  // ── Bind sliders and buttons for one panel ────────────────────────────────
  _bindROIPanel(cam) {
    const id   = cam.id;
    const keys = ["x", "y", "w", "h", "prox"];

    // Slider → live canvas redraw
    keys.forEach((key) => {
      const input = document.getElementById(`slider-${id}-${key}`);
      const label = document.getElementById(`slval-${id}-${key}`);
      if (!input || !label) return;
      input.addEventListener("input", () => {
        const unit = key === "prox" ? "px" : "%";
        label.textContent = `${input.value}${unit}`;
        this._redrawPanel(id);
      });
    });

    // Save button
    document.getElementById(`roi-save-${id}`)?.addEventListener("click", () => {
      this._saveROI(id);
    });

    // Reset button
    document.getElementById(`roi-reset-${id}`)?.addEventListener("click", () => {
      this._resetROI(id);
    });

    // Start polling the live camera frame for this panel
    this._startFramePoll(cam);
  },

  // ── Start per-camera frame poll ───────────────────────────────────────────
  // Each panel polls its own camera at 2 s — slower than the Cameras page
  // (1.5 s) because the Settings page is for configuration, not monitoring.
  _startFramePoll(cam) {
    const poll = async () => {
      try {
        const data = await getCameraFrame(cam.id);
        this._updatePanelFrame(cam.id, data);
      } catch {}
    };
    poll(); // immediate first frame
    this._frameTimers[cam.id] = setInterval(poll, 2000);
  },

  // ── Update the canvas background with the latest camera frame ────────────
  _updatePanelFrame(cameraId, data) {
    const canvas = document.getElementById(`roi-canvas-${cameraId}`);
    if (!canvas) return;

    const offlineEl = document.getElementById(`roi-offline-${cameraId}`);

    if (!data?.image || !data?.available) {
      // Camera offline — draw the ROI on a plain dark background
      if (offlineEl) offlineEl.classList.remove("roi-canvas-offline--hidden");
      this._redrawPanel(cameraId, null);
      return;
    }

    if (offlineEl) offlineEl.classList.add("roi-canvas-offline--hidden");

    // Draw the camera frame as the canvas background, then overlay the ROI
    const img = new Image();
    img.onload = () => {
      // Size canvas to natural 4:3 ratio within its container
      const wrap = canvas.parentElement;
      const W    = wrap.clientWidth || 360;
      const H    = Math.round(W * 0.5625); // 16:9
      canvas.width  = W;
      canvas.height = H;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, W, H);

      // Overlay the ROI zone on top of the frame
      const roi = this._getCurrentSliderValues(cameraId);
      drawROIOverlay(canvas, roi, {
        color:          "rgba(0, 220, 255, 0.95)",
        label:          "Restricted Zone",
        showDimensions: true,
      });
    };
    img.src = data.image;
  },

  // ── Redraw canvas from slider values only (no new frame) ──────────────────
  // Called on every slider input so feedback is instant without waiting
  // for the next frame poll.
  _redrawPanel(cameraId, bgImage = undefined) {
    const canvas = document.getElementById(`roi-canvas-${cameraId}`);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // If bgImage is explicitly null, draw a dark background
    if (bgImage === null) {
      const W = canvas.width  || 360;
      const H = canvas.height || 203;
      canvas.width  = W;
      canvas.height = H;
      ctx.fillStyle = "#080c14";
      ctx.fillRect(0, 0, W, H);
      // Grid lines
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    }
    // If bgImage is undefined we just redraw the ROI on whatever is there

    const roi = this._getCurrentSliderValues(cameraId);
    drawROIOverlay(canvas, roi, {
      color:          "rgba(0, 220, 255, 0.95)",
      label:          "Restricted Zone",
      showDimensions: true,
    });
  },

  // ── Read current slider values for a camera ───────────────────────────────
  _getCurrentSliderValues(cameraId) {
    const get = (key) => {
      const el = document.getElementById(`slider-${cameraId}-${key}`);
      return el ? parseFloat(el.value) : null;
    };
    return {
      x:    (get("x")    ?? 5)  / 100,
      y:    (get("y")    ?? 6)  / 100,
      w:    (get("w")    ?? 17) / 100,
      h:    (get("h")    ?? 22) / 100,
      prox:  get("prox") ?? 15,
    };
  },

  // ── Save a camera's ROI ───────────────────────────────────────────────────
  _saveROI(cameraId) {
    const roi = this._getCurrentSliderValues(cameraId);
    roiStore.set(cameraId, roi);

    // Update the badge in the panel header
    const panel = document.getElementById(`roi-panel-${cameraId}`);
    if (panel) {
      const def = panel.querySelector(".roi-default-badge");
      const cus = panel.querySelector(".roi-custom-badge");
      if (def) def.style.display = "none";
      if (cus) cus.style.display = "";
      if (!cus) {
        const hdr = panel.querySelector(".roi-panel__header");
        const badge = document.createElement("span");
        badge.className = "roi-custom-badge";
        badge.textContent = "Custom ROI";
        hdr.appendChild(badge);
      }
    }

    // Update the .env output block
    this._updateEnvOutput(cameraId, roi);

    // Confirmation message
    const msg = document.getElementById(`roi-saved-${cameraId}`);
    if (msg) {
      msg.textContent = `✔ Zone saved for ${cameraId} — visible on Cameras page immediately`;
      msg.className   = "roi-saved-msg roi-saved-msg--ok";
      setTimeout(() => { msg.className = "roi-saved-msg roi-saved-msg--hidden"; }, 3000);
    }
  },

  // ── Reset a camera's ROI to defaults ─────────────────────────────────────
  _resetROI(cameraId) {
    const defaults = roiStore.reset(cameraId);

    // Reset sliders to default values
    const setSlider = (key, val) => {
      const input = document.getElementById(`slider-${cameraId}-${key}`);
      const label = document.getElementById(`slval-${cameraId}-${key}`);
      if (input) input.value  = val;
      if (label) label.textContent = key === "prox" ? `${val}px` : `${val}%`;
    };
    setSlider("x",    Math.round(defaults.x    * 100));
    setSlider("y",    Math.round(defaults.y    * 100));
    setSlider("w",    Math.round(defaults.w    * 100));
    setSlider("h",    Math.round(defaults.h    * 100));
    setSlider("prox", defaults.prox);

    this._redrawPanel(cameraId);

    // Update badges
    const panel = document.getElementById(`roi-panel-${cameraId}`);
    if (panel) {
      const def = panel.querySelector(".roi-default-badge");
      const cus = panel.querySelector(".roi-custom-badge");
      if (cus) cus.style.display = "none";
      if (def) def.style.display = "";
    }

    const msg = document.getElementById(`roi-saved-${cameraId}`);
    if (msg) {
      msg.textContent = `↺ Reset to defaults for ${cameraId}`;
      msg.className   = "roi-saved-msg roi-saved-msg--info";
      setTimeout(() => { msg.className = "roi-saved-msg roi-saved-msg--hidden"; }, 2500);
    }
  },

  // ── Update .env output block ──────────────────────────────────────────────
  _updateEnvOutput(cameraId, roi) {
    const el = document.getElementById("global-env-text");
    if (!el) return;
    el.textContent = [
      `# Generated from per-camera ROI for: ${cameraId}`,
      `ROI_X=${roi.x.toFixed(2)}`,
      `ROI_Y=${roi.y.toFixed(2)}`,
      `ROI_W=${roi.w.toFixed(2)}`,
      `ROI_H=${roi.h.toFixed(2)}`,
      `ROI_PROXIMITY_PX=${roi.prox}`,
    ].join("\n");
  },

  // ── Right column renders ──────────────────────────────────────────────────
  _renderCameraSourceList(cameras) {
    const el = document.getElementById("settings-cameras");
    if (!el) return;
    el.innerHTML = cameras.map((cam) => `
      <div class="settings-cam-row">
        <span class="cam-tile__dot cam-tile__dot--${cam.online ? "online" : "offline"}"
              style="width:9px;height:9px;border-radius:50%;flex-shrink:0;"></span>
        <div class="settings-cam-info">
          <strong>${cam.name}</strong>
          <span style="color:var(--text-faint);font-size:.75rem">(${cam.zone})</span>
          <div style="font-size:.72rem;color:var(--text-faint);margin-top:2px;">
            Source: <code>${cam.source ?? "disabled"}</code>
            · ${cam.online
                ? '<span style="color:var(--online)">Online</span>'
                : '<span style="color:var(--offline)">Offline</span>'}
            ${cam.last_detection ? `· Last: ${cam.last_detection}` : ""}
          </div>
        </div>
      </div>`).join("");
  },

  _renderInfo(summary, live) {
    const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    set("info-model",  summary.ai_model || "—");
    set("info-safety", summary.safety_model?.available
      ? summary.safety_model.supported_labels.join(", ") : "demo mode");
    set("info-cams",   `${live.online_count} / ${live.cameras.length}`);
    set("info-mode",   live.system.armed ? "ARMED" : "DISARMED");
  },

  _updateArmButton() {
    const btn = document.getElementById("settings-arm-btn");
    if (!btn) return;
    btn.textContent = this._armed ? "Disarm System" : "Arm System";
    btn.className   = this._armed ? "btn btn--disarm" : "btn btn--arm";
  },

  _updateMonButton() {
    const btn = document.getElementById("settings-mon-btn");
    if (!btn) return;
    btn.textContent = this._monitoring ? "Monitoring On" : "Monitoring Off";
    btn.className   = this._monitoring ? "btn btn--monitoring-on" : "btn btn--monitoring-off";
  },
};

// ── Slider HTML helper ────────────────────────────────────────────────────────
function _sliderHTML(camId, key, label, value, min, max, unit) {
  const display = `${Math.round(value)}${unit}`;
  return `
    <label class="slider-row">
      <span class="slider-row__label">
        ${label}
        <span id="slval-${camId}-${key}" class="slider-val">${display}</span>
      </span>
      <input type="range"
             id="slider-${camId}-${key}"
             class="slider"
             min="${min}" max="${max}"
             value="${Math.round(value)}"
             step="${key === "prox" ? 1 : 1}">
    </label>`;
}
