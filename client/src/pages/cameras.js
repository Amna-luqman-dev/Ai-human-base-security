/* =========================================================================
   cameras.js — Live camera feeds page
   =========================================================================
   New in this version:
     • Person count strip on every tile (count + IN/OUT per camera)
     • Reset counters button per tile
     • Feedback buttons in zoom modal (✔ Correct / ✗ False Alarm)
     • Last frame data stored in _modal so feedback can send it

   Person count works by reading person_count, count_in, count_out from the
   frame response (added in backend Task 1).  The numbers come from the
   IoU-based crossing-line tracker running server-side.

   Feedback flow:
     1. User opens zoom modal on a live frame
     2. Clicks ✔ Correct (real detection) or ✗ False Alarm
     3. submitFeedback() sends the current frame image + persons list + label
     4. Backend saves JPEG + YOLO label file to feedback_data/
     5. Enough samples → user can trigger fine-tuning from the Training page
   ========================================================================= */

import { getCameraFrame, getLiveStatus, testCamera,
         resetCameraCounts, submitFeedback }        from "../api.js";
import { roiStore, drawROIOverlay }                 from "../roi.js";
import { getDetectionSettings, setDetectionImgsz }  from "../api.js";

const MIN_ZOOM  = 1.0;
const MAX_ZOOM  = 6.0;
const ZOOM_STEP = 0.2;

export const CamerasPage = {
  _intervals:     [],
  _cameras:       [],
  _modal:         null,
  _modalInterval: null,
  _currentImgsz:  320,
  _lastFrameData: {},   // cameraId → last frame data (for feedback)

  mount(container) {
    container.innerHTML = this._template();
    this._gridEl = document.getElementById("cameras-grid");
    this._fetchCameras();
    this._loadDetectionSettings();
    this._intervals = [
      setInterval(() => this._pollGrid(),         1500),
      setInterval(() => this._refreshInventory(),  5000),
    ];
    this._setupModal();
    this._bindDetectionControls();
  },

  unmount() {
    this._intervals.forEach(clearInterval);
    this._intervals = [];
    this._closeModal();
  },

  // ── Template ─────────────────────────────────────────────────────────────
  _template() {
    return `
      <div class="page">
        <div class="page__header">
          <h2 class="page__title">Cameras</h2>
          <span class="page__sub">
            Click ⤢ to zoom · Use ✔/✗ in zoom view to train the model
          </span>
        </div>

        <!-- Detection Range bar -->
        <div class="det-range-bar">
          <div class="det-range-bar__left">
            <span class="det-range-bar__title">Detection Range</span>
            <span class="det-range-bar__sub">Higher = detects farther · Lower = faster</span>
          </div>
          <div class="det-range-presets" id="det-presets">
            <button class="det-preset" data-imgsz="320">
              <span class="det-preset__icon">👤</span>
              <span class="det-preset__name">Close</span>
              <span class="det-preset__desc">~3 m · Fast</span>
            </button>
            <button class="det-preset" data-imgsz="480">
              <span class="det-preset__icon">🚶</span>
              <span class="det-preset__name">Balanced</span>
              <span class="det-preset__desc">~6 m · Medium</span>
            </button>
            <button class="det-preset" data-imgsz="640">
              <span class="det-preset__icon">🏃</span>
              <span class="det-preset__name">Far</span>
              <span class="det-preset__desc">~12 m · Slower</span>
            </button>
            <button class="det-preset" data-imgsz="1280">
              <span class="det-preset__icon">🔭</span>
              <span class="det-preset__name">Max</span>
              <span class="det-preset__desc">12 m+ · High CPU</span>
            </button>
          </div>
          <div class="det-range-bar__status">
            <span class="det-status-dot" id="det-status-dot"></span>
            <span id="det-status-text">Loading…</span>
          </div>
        </div>

        <div id="cameras-grid" class="camera-grid camera-grid--page"></div>

        <!-- Zoom modal -->
        <div id="zoom-modal" class="zoom-modal zoom-modal--hidden"
             role="dialog" aria-modal="true" aria-label="Camera zoom view">
          <div class="zoom-modal__backdrop" id="zoom-backdrop"></div>
          <div class="zoom-modal__shell">

            <!-- Toolbar: title + zoom controls -->
            <div class="zoom-modal__toolbar">
              <span class="zoom-modal__title" id="zoom-title">Camera</span>
              <div class="zoom-modal__controls">
                <button class="zoom-btn" id="zoom-out-btn" title="Zoom out (-)">−</button>
                <span   class="zoom-level" id="zoom-level">1.0×</span>
                <button class="zoom-btn" id="zoom-in-btn"  title="Zoom in (+)">+</button>
                <button class="zoom-btn zoom-btn--reset" id="zoom-reset-btn" title="Reset">Reset</button>
                <button class="zoom-btn zoom-btn--close" id="zoom-close-btn" title="Close (Esc)">✕</button>
              </div>
            </div>

            <!-- Image + ROI canvas -->
            <div class="zoom-modal__viewport" id="zoom-viewport">
              <img    id="zoom-img"    class="zoom-modal__img"    alt="Zoomed camera feed" draggable="false"/>
              <canvas id="zoom-canvas" class="zoom-modal__canvas"></canvas>
            </div>

            <!-- Detection readout strip -->
            <div class="zoom-modal__readout" id="zoom-readout"></div>

            <!-- ── Person count + In/Out bar ─────────────────────────────
                 Shown below the image in the modal.
                 count_in / count_out come from the backend crossing-line
                 tracker.  Reset sends POST /cameras/{id}/counts/reset.
            ──────────────────────────────────────────────────────────── -->
            <div class="zoom-modal__counts" id="zoom-counts">
              <div class="count-strip">
                <div class="count-cell">
                  <span class="count-cell__icon">👥</span>
                  <span class="count-cell__label">In frame</span>
                  <span class="count-cell__value" id="modal-count">—</span>
                </div>
                <div class="count-cell count-cell--in">
                  <span class="count-cell__icon">⬇</span>
                  <span class="count-cell__label">Entered</span>
                  <span class="count-cell__value" id="modal-in">—</span>
                </div>
                <div class="count-cell count-cell--out">
                  <span class="count-cell__icon">⬆</span>
                  <span class="count-cell__label">Exited</span>
                  <span class="count-cell__value" id="modal-out">—</span>
                </div>
                <button class="btn-reset-counts" id="modal-reset-counts" title="Reset in/out counters">
                  ↺ Reset
                </button>
              </div>
            </div>

            <!-- ── Feedback buttons ───────────────────────────────────────
                 WHY FEEDBACK?
                 Every time the model makes a detection, the user can judge:
                   ✔ Correct    → real person, save frame+boxes as training data
                   ✗ False Alarm→ misfired, save empty label to teach model
                 10+ samples unlock fine-tuning on the Training page.
            ──────────────────────────────────────────────────────────── -->
            <div class="zoom-modal__feedback" id="zoom-feedback">
              <span class="feedback-label">Was this detection correct?</span>
              <button class="btn-feedback btn-feedback--correct" id="fb-correct">
                ✔ Correct
              </button>
              <button class="btn-feedback btn-feedback--false" id="fb-false">
                ✗ False Alarm
              </button>
              <span class="feedback-status" id="fb-status"></span>
            </div>

          </div>
        </div>
      </div>
    `;
  },

  // ── Detection range ───────────────────────────────────────────────────────
  async _loadDetectionSettings() {
    try {
      const data = await getDetectionSettings();
      this._currentImgsz = data.imgsz;
      this._renderDetectionPresets(data.imgsz);
    } catch { this._renderDetectionPresets(320); }
  },

  _bindDetectionControls() {
    document.querySelectorAll(".det-preset").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const imgsz = parseInt(btn.dataset.imgsz);
        this._renderDetectionPresets(imgsz);
        this._setDetStatusText("Applying…", "checking");
        btn.disabled = true;
        try {
          const res = await setDetectionImgsz(imgsz);
          this._currentImgsz = res.imgsz;
          this._renderDetectionPresets(res.imgsz);
          this._setDetStatusText(`${res.imgsz}px · ${res.preset} mode`, "ok");
        } catch {
          this._setDetStatusText("Failed — backend offline?", "error");
          this._renderDetectionPresets(this._currentImgsz);
        } finally {
          document.querySelectorAll(".det-preset").forEach((b) => { b.disabled = false; });
        }
      });
    });
  },

  _renderDetectionPresets(activeImgsz) {
    document.querySelectorAll(".det-preset").forEach((btn) => {
      btn.classList.toggle("det-preset--active", parseInt(btn.dataset.imgsz) === activeImgsz);
    });
    const labels = { 320: "Close · ~50-100ms", 480: "Balanced · ~100-200ms",
                     640: "Far · ~200-400ms",  1280: "Max · ~500ms+" };
    this._setDetStatusText(`${activeImgsz}px — ${labels[activeImgsz] || "custom"}`, "ok");
  },

  _setDetStatusText(text, state = "ok") {
    const dot  = document.getElementById("det-status-dot");
    const span = document.getElementById("det-status-text");
    if (dot)  dot.className    = `det-status-dot det-status-dot--${state}`;
    if (span) span.textContent = text;
  },

  // ── Camera inventory ──────────────────────────────────────────────────────
  async _fetchCameras() {
    try {
      const data = await getLiveStatus();
      this._cameras = data.cameras;
      this._pollGrid();
    } catch (err) { console.error("Cameras inventory:", err.message); }
  },

  async _refreshInventory() {
    try {
      const data = await getLiveStatus();
      this._cameras = data.cameras;
    } catch {}
  },

  // ── Grid poll ─────────────────────────────────────────────────────────────
  async _pollGrid() {
    if (!this._cameras.length) return;

    const results = await Promise.allSettled(
      this._cameras.map((c) => getCameraFrame(c.id))
    );

    const html = this._cameras.map((cam, i) => {
      const res  = results[i];
      const data = res.status === "fulfilled" ? res.value : null;
      if (data) this._lastFrameData[cam.id] = data;  // cache for feedback
      return this._tileHTML(cam, data);
    }).join("");

    if (this._gridEl.dataset.lastHtml === html) {
      // Incremental update — just swap images, badges, count strips
      this._cameras.forEach((cam, i) => {
        const res  = results[i];
        const data = res.status === "fulfilled" ? res.value : null;
        if (!data?.image) return;
        const tile = this._gridEl.querySelector(`[data-camera-id="${cam.id}"]`);
        if (!tile) return;
        const img = tile.querySelector(".cam-tile__img");
        if (img) img.src = data.image;
        this._updateTileBadge(tile, data);
        this._updateTileCountStrip(tile, data);
        this._redrawTileCanvas(tile, cam.id);
      });
    } else {
      this._gridEl.innerHTML = html;
      this._gridEl.dataset.lastHtml = html.replace(/src="data:image[^"]*"/g, 'src="..."');
      this._attachTileListeners();
      this._cameras.forEach((cam) => {
        const tile = this._gridEl.querySelector(`[data-camera-id="${cam.id}"]`);
        if (tile) this._redrawTileCanvas(tile, cam.id);
      });
    }

    // Keep modal fresh
    if (this._modal) {
      const idx  = this._cameras.findIndex((c) => c.id === this._modal.cam.id);
      const res  = idx >= 0 ? results[idx] : null;
      const data = res?.status === "fulfilled" ? res.value : null;
      if (data) this._updateModalFrame(data);
    }
  },

  // ── Tile HTML ─────────────────────────────────────────────────────────────
  _tileHTML(cam, data) {
    const online       = data?.available ?? false;
    const badge        = _tileBadge(data);
    const conf         = data?.confidence ? `${(data.confidence * 100).toFixed(0)}%` : "—";
    const latency      = data?.latency_ms ? `${data.latency_ms} ms` : "—";
    const sev          = _detSev(data);
    const hasCustomRoi = roiStore.hasCustom(cam.id);
    const count        = data?.person_count ?? 0;
    const countIn      = data?.count_in     ?? 0;
    const countOut     = data?.count_out    ?? 0;

    const viewContent = online && data?.image
      ? `<img class="cam-tile__img" src="${data.image}" alt="${cam.name}" draggable="false"/>
         <canvas class="cam-tile__canvas"></canvas>`
      : `<div class="cam-tile__offline">
           <div class="cam-tile__offline-icon">📷</div>
           <div class="cam-tile__offline-text">Camera Unavailable</div>
         </div>`;

    return `
      <div class="cam-tile ${sev === "danger" ? "cam-tile--alert" : sev === "warning" ? "cam-tile--warn" : ""}"
           data-camera-id="${cam.id}" data-camera-name="${cam.name}" data-online="${online}">

        <div class="cam-tile__label">
          <span class="cam-tile__dot cam-tile__dot--${online ? "online" : "offline"}"></span>
          <span class="cam-tile__name">${cam.name}</span>
          <span class="cam-tile__zone">${cam.zone}</span>
          ${badge ? `<span class="cam-tile__badge ${badge.cls}">${badge.text}</span>` : ""}
          ${hasCustomRoi ? `<span class="cam-tile__roi-indicator" title="Custom ROI">⬡</span>` : ""}
          <button class="cam-tile__zoom-btn" data-id="${cam.id}" data-name="${cam.name}" title="Open zoom">⤢</button>
        </div>

        <div class="cam-tile__view">${viewContent}</div>

        <!-- ── Person count strip ──
             Shows live person count + cumulative in/out totals.
             Only rendered when camera is online.
        ── -->
        ${online ? `
        <div class="count-strip count-strip--tile">
          <div class="count-cell">
            <span class="count-cell__icon">👥</span>
            <span class="count-cell__label">Now</span>
            <span class="count-cell__value ${count > 0 ? "count-cell__value--active" : ""}">${count}</span>
          </div>
          <div class="count-cell count-cell--in">
            <span class="count-cell__icon">⬇</span>
            <span class="count-cell__label">IN</span>
            <span class="count-cell__value">${countIn}</span>
          </div>
          <div class="count-cell count-cell--out">
            <span class="count-cell__icon">⬆</span>
            <span class="count-cell__label">OUT</span>
            <span class="count-cell__value">${countOut}</span>
          </div>
          <button class="btn-reset-counts btn-reset-counts--tile" data-id="${cam.id}" title="Reset counters">↺</button>
        </div>` : ""}

        <div class="cam-tile__readout">
          <div class="cam-tile__stat">
            <span class="cam-tile__stat-label">Status</span>
            <span class="cam-tile__stat-value ${sev === "danger" ? "readout-value--danger" : sev === "warning" ? "readout-value--warning" : "readout-value--ok"}">
              ${data?.detection_message || data?.message || "—"}
            </span>
          </div>
          <div class="cam-tile__stat">
            <span class="cam-tile__stat-label">Conf</span>
            <span class="cam-tile__stat-value">${conf}</span>
          </div>
          <div class="cam-tile__stat">
            <span class="cam-tile__stat-label">Latency</span>
            <span class="cam-tile__stat-value">${latency}</span>
          </div>
          ${data?.safety_label ? `
          <div class="cam-tile__stat">
            <span class="cam-tile__stat-label">Safety</span>
            <span class="cam-tile__stat-value readout-value--danger">${data.safety_label}</span>
          </div>` : ""}
        </div>

        <button class="cam-tile__test-btn" data-id="${cam.id}">Test Connection</button>
      </div>`;
  },

  // ── Incremental count strip update (no full re-render) ───────────────────
  _updateTileCountStrip(tile, data) {
    const strip = tile.querySelector(".count-strip--tile");
    if (!strip) return;
    const count    = data?.person_count ?? 0;
    const countIn  = data?.count_in     ?? 0;
    const countOut = data?.count_out    ?? 0;
    const cells    = strip.querySelectorAll(".count-cell__value");
    if (cells[0]) {
      cells[0].textContent = count;
      cells[0].className   = `count-cell__value${count > 0 ? " count-cell__value--active" : ""}`;
    }
    if (cells[1]) cells[1].textContent = countIn;
    if (cells[2]) cells[2].textContent = countOut;
  },

  // ── Canvas ROI overlay ────────────────────────────────────────────────────
  _redrawTileCanvas(tile, cameraId) {
    const canvas = tile.querySelector(".cam-tile__canvas");
    const img    = tile.querySelector(".cam-tile__img");
    if (!canvas || !img) return;
    const rect = img.getBoundingClientRect();
    if (rect.width === 0) return;
    canvas.width  = rect.width;
    canvas.height = rect.height;
    drawROIOverlay(canvas, roiStore.get(cameraId), {
      color: "rgba(0,220,255,.95)", label: "Frontend Zone", showDimensions: true,
    });
  },

  // ── Tile badge update ─────────────────────────────────────────────────────
  _updateTileBadge(tile, data) {
    const badge    = _tileBadge(data);
    const existing = tile.querySelector(".cam-tile__badge");
    if (existing) {
      existing.textContent = badge?.text || "";
      existing.className   = `cam-tile__badge ${badge?.cls || ""}`;
    }
    const sev = _detSev(data);
    tile.className  = `cam-tile ${sev === "danger" ? "cam-tile--alert" : sev === "warning" ? "cam-tile--warn" : ""}`;
    tile.dataset.online = String(data?.available ?? false);
  },

  // ── Tile event listeners ──────────────────────────────────────────────────
  _attachTileListeners() {
    // Zoom button
    this._gridEl.querySelectorAll(".cam-tile__zoom-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cam = this._cameras.find((c) => c.id === btn.dataset.id);
        this._openModal(cam || { id: btn.dataset.id, name: btn.dataset.name });
      });
    });

    // Click image → open modal
    this._gridEl.querySelectorAll(".cam-tile__view").forEach((view) => {
      view.addEventListener("click", () => {
        const tile = view.closest(".cam-tile");
        if (tile.dataset.online !== "true") return;
        const cam = this._cameras.find((c) => c.id === tile.dataset.cameraId);
        this._openModal(cam || { id: tile.dataset.cameraId, name: tile.dataset.cameraName });
      });
    });

    // Test button
    this._gridEl.querySelectorAll(".cam-tile__test-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.textContent = "Testing…"; btn.disabled = true;
        try { await testCamera(); } catch {}
        btn.textContent = "Test Connection"; btn.disabled = false;
      });
    });

    // Reset counters (tile)
    this._gridEl.querySelectorAll(".btn-reset-counts--tile").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await resetCameraCounts(btn.dataset.id);
          // Zero out the visible values immediately
          const strip = btn.closest(".count-strip--tile");
          if (strip) {
            strip.querySelectorAll(".count-cell__value").forEach((v) => { v.textContent = "0"; });
          }
        } catch {}
      });
    });
  },

  // ── Zoom modal setup ──────────────────────────────────────────────────────
  _setupModal() {
    this._modalEl    = document.getElementById("zoom-modal");
    this._backdropEl = document.getElementById("zoom-backdrop");
    this._zoomImg    = document.getElementById("zoom-img");
    this._zoomCanvas = document.getElementById("zoom-canvas");
    this._viewportEl = document.getElementById("zoom-viewport");
    this._zoomLabel  = document.getElementById("zoom-level");
    this._titleEl    = document.getElementById("zoom-title");
    this._readoutEl  = document.getElementById("zoom-readout");

    this._backdropEl.addEventListener("click", () => this._closeModal());
    document.getElementById("zoom-close-btn").addEventListener("click", () => this._closeModal());
    document.getElementById("zoom-reset-btn").addEventListener("click", () => this._resetZoom());
    document.getElementById("zoom-in-btn"   ).addEventListener("click", () => this._stepZoom(+ZOOM_STEP));
    document.getElementById("zoom-out-btn"  ).addEventListener("click", () => this._stepZoom(-ZOOM_STEP));

    // Reset in/out counters from modal
    document.getElementById("modal-reset-counts")?.addEventListener("click", async () => {
      if (!this._modal) return;
      try {
        await resetCameraCounts(this._modal.cam.id);
        ["modal-count","modal-in","modal-out"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.textContent = "0";
        });
      } catch {}
    });

    // ── Feedback buttons ────────────────────────────────────────────────────
    document.getElementById("fb-correct")?.addEventListener("click", () =>
      this._submitFeedback("correct"));
    document.getElementById("fb-false")?.addEventListener("click", () =>
      this._submitFeedback("false_alarm"));

    // Keyboard
    document.addEventListener("keydown", (e) => {
      if (!this._modal) return;
      if (e.key === "Escape") this._closeModal();
      if (e.key === "=")      this._stepZoom(+ZOOM_STEP);
      if (e.key === "-")      this._stepZoom(-ZOOM_STEP);
      if (e.key === "0")      this._resetZoom();
    });

    // Mouse-wheel zoom
    this._viewportEl.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (!this._modal) return;
      const delta = e.deltaY > 0 ? -ZOOM_STEP : +ZOOM_STEP;
      const rect  = this._zoomImg.getBoundingClientRect();
      const ox = ((e.clientX - rect.left) / rect.width  * 100).toFixed(1) + "%";
      const oy = ((e.clientY - rect.top)  / rect.height * 100).toFixed(1) + "%";
      this._zoomImg.style.transformOrigin    = `${ox} ${oy}`;
      this._zoomCanvas.style.transformOrigin = `${ox} ${oy}`;
      this._stepZoom(delta);
    }, { passive: false });

    // Pinch-to-zoom
    let lastPinchDist = null;
    this._viewportEl.addEventListener("touchmove", (e) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const dx   = e.touches[0].clientX - e.touches[1].clientX;
      const dy   = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastPinchDist !== null) this._stepZoom((dist - lastPinchDist) * 0.005);
      lastPinchDist = dist;
    }, { passive: false });
    this._viewportEl.addEventListener("touchend", () => { lastPinchDist = null; });

    // Pan
    let dragging = false, dragStart = { x:0, y:0 };
    this._pan = { x:0, y:0 };
    this._viewportEl.addEventListener("mousedown", (e) => {
      if (!this._modal || this._modal.zoom <= 1) return;
      dragging  = true;
      dragStart = { x: e.clientX - this._pan.x, y: e.clientY - this._pan.y };
      this._viewportEl.style.cursor = "grabbing";
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      this._pan = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y };
      this._applyTransform();
    });
    document.addEventListener("mouseup", () => {
      dragging = false;
      if (this._viewportEl) this._viewportEl.style.cursor = "";
    });
  },

  // ── Feedback submission ───────────────────────────────────────────────────
  async _submitFeedback(label) {
    if (!this._modal) return;
    const camId = this._modal.cam.id;
    const frame = this._lastFrameData[camId];
    const statusEl = document.getElementById("fb-status");

    if (!frame?.image) {
      if (statusEl) { statusEl.textContent = "No frame available"; statusEl.className = "feedback-status feedback-status--error"; }
      return;
    }

    // Disable buttons while submitting
    ["fb-correct","fb-false"].forEach((id) => {
      const b = document.getElementById(id); if (b) b.disabled = true;
    });
    if (statusEl) { statusEl.textContent = "Saving…"; statusEl.className = "feedback-status"; }

    try {
      const result = await submitFeedback({
        image:     frame.image,
        label,
        camera_id: camId,
        persons:   frame.persons || [],
        frame_w:   640,
        frame_h:   480,
      });
      if (statusEl) {
        statusEl.textContent = `✔ Saved (${result.total} total) — go to Training to fine-tune`;
        statusEl.className   = "feedback-status feedback-status--ok";
      }
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = `Error: ${err.message}`;
        statusEl.className   = "feedback-status feedback-status--error";
      }
    } finally {
      ["fb-correct","fb-false"].forEach((id) => {
        const b = document.getElementById(id); if (b) b.disabled = false;
      });
      // Auto-clear status after 4 s
      setTimeout(() => {
        if (statusEl) { statusEl.textContent = ""; statusEl.className = "feedback-status"; }
      }, 4000);
    }
  },

  // ── Modal open / close ────────────────────────────────────────────────────
  _openModal(cam) {
    this._modal = { cam, zoom: 1.0 };
    this._pan   = { x:0, y:0 };
    this._titleEl.textContent              = cam.name;
    this._zoomImg.style.transform          = "scale(1)";
    this._zoomCanvas.style.transform       = "scale(1)";
    this._zoomImg.style.transformOrigin    = "center center";
    this._zoomCanvas.style.transformOrigin = "center center";
    this._zoomLabel.textContent            = "1.0×";
    this._modalEl.classList.remove("zoom-modal--hidden");
    document.body.style.overflow = "hidden";
    // Clear feedback status
    const fbStatus = document.getElementById("fb-status");
    if (fbStatus) { fbStatus.textContent = ""; fbStatus.className = "feedback-status"; }
    this._modalInterval = setInterval(() => this._pollModalFrame(), 1500);
    this._pollModalFrame();
  },

  _closeModal() {
    if (this._modalInterval) clearInterval(this._modalInterval);
    this._modalInterval = null;
    this._modal = null;
    if (this._modalEl) this._modalEl.classList.add("zoom-modal--hidden");
    document.body.style.overflow = "";
  },

  // ── Modal frame poll ──────────────────────────────────────────────────────
  async _pollModalFrame() {
    if (!this._modal) return;
    try {
      const data = await getCameraFrame(this._modal.cam.id);
      this._lastFrameData[this._modal.cam.id] = data;
      this._updateModalFrame(data);
    } catch {}
  },

  _updateModalFrame(data) {
    if (!this._modal) return;
    if (data?.image) {
      this._zoomImg.src = data.image;
      this._zoomImg.onload = () => this._redrawModalCanvas();
      this._redrawModalCanvas();
    }

    // Detection readout
    const sev = _detSev(data);
    const col = sev === "danger" ? "var(--armed)" : sev === "warning" ? "var(--warning)" : "var(--online)";
    this._readoutEl.innerHTML = `
      <span style="color:${col}">${data?.detection_message || data?.message || "—"}</span>
      &nbsp;·&nbsp; Conf: ${data?.confidence ? (data.confidence * 100).toFixed(0) + "%" : "—"}
      &nbsp;·&nbsp; ${data?.latency_ms ? data.latency_ms + "ms" : "—"}
      ${data?.safety_label ? `&nbsp;·&nbsp;<span style="color:var(--armed)">Safety: ${data.safety_label}</span>` : ""}
    `;

    // Update count cells
    const setCell = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val ?? "—"; };
    setCell("modal-count", data?.person_count ?? 0);
    setCell("modal-in",    data?.count_in     ?? 0);
    setCell("modal-out",   data?.count_out    ?? 0);

    // Show/hide feedback bar — only meaningful when person detected
    const fbBar = document.getElementById("zoom-feedback");
    if (fbBar) {
      fbBar.style.display = (data?.person_detected || data?.harmful_activity_detected) ? "" : "none";
    }
  },

  // ── Modal canvas ROI ──────────────────────────────────────────────────────
  _redrawModalCanvas() {
    if (!this._modal || !this._zoomCanvas) return;
    const rect = this._zoomImg.getBoundingClientRect();
    if (rect.width === 0) return;
    this._zoomCanvas.width  = rect.width;
    this._zoomCanvas.height = rect.height;
    drawROIOverlay(this._zoomCanvas, roiStore.get(this._modal.cam.id), {
      color: "rgba(0,220,255,.95)", label: "Frontend Zone", showDimensions: true,
    });
  },

  // ── Zoom helpers ──────────────────────────────────────────────────────────
  _stepZoom(delta) {
    if (!this._modal) return;
    this._modal.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this._modal.zoom + delta));
    this._applyTransform();
    this._zoomLabel.textContent = this._modal.zoom.toFixed(1) + "×";
    if (this._modal.zoom === 1) {
      this._pan = { x:0, y:0 };
      this._zoomImg.style.transformOrigin    = "center center";
      this._zoomCanvas.style.transformOrigin = "center center";
    }
    this._redrawModalCanvas();
  },

  _resetZoom() {
    if (!this._modal) return;
    this._modal.zoom = 1.0;
    this._pan        = { x:0, y:0 };
    this._zoomImg.style.transform          = "scale(1)";
    this._zoomCanvas.style.transform       = "scale(1)";
    this._zoomImg.style.transformOrigin    = "center center";
    this._zoomCanvas.style.transformOrigin = "center center";
    this._zoomLabel.textContent            = "1.0×";
    this._redrawModalCanvas();
  },

  _applyTransform() {
    if (!this._modal) return;
    const z = this._modal.zoom;
    const t = `scale(${z}) translate(${this._pan.x/z}px, ${this._pan.y/z}px)`;
    this._zoomImg.style.transform    = t;
    this._zoomCanvas.style.transform = t;
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────
function _detSev(data) {
  if (!data) return "ok";
  // Use structured threat_level when available (new backend field)
  if (data.threat_level === "CRITICAL") return "danger";
  if (data.threat_level === "HIGH")     return "danger";
  if (data.threat_level === "MEDIUM")   return "warning";
  if (data.threat_level === "LOW")      return "warning";
  // Fallback to individual booleans for backward compat
  if (data.harmful_activity_detected)  return "danger";
  if (data.intrusion_detected)          return "danger";
  if (data.near_zone_detected)          return "warning";
  if (data.person_detected)             return "warning";
  return "ok";
}

function _tileBadge(data) {
  if (!data) return null;
  // Fire — highest priority, bright orange label
  if (data.fire_detected)             return { text: "🔥 FIRE",    cls: "cam-tile__badge--fire" };
  if (data.weapon_detected)           return { text: `🔫 ${data.weapon_label || "WEAPON"}`, cls: "cam-tile__badge--weapon" };
  if (data.fight_detected)            return { text: "⚔ FIGHT",   cls: "cam-tile__badge--fight" };
  if (data.harmful_activity_detected) return { text: "⚠ HARMFUL", cls: "cam-tile__badge--harmful" };
  if (data.intrusion_detected)         return { text: "🚨 Intrusion", cls: "cam-tile__badge--intrusion" };
  if (data.near_zone_detected)         return { text: "⚠ Near Zone", cls: "cam-tile__badge--person" };
  if (data.person_detected)            return { text: `👤 ${data.person_count ?? 1} Person${(data.person_count ?? 1) !== 1 ? "s" : ""}`, cls: "cam-tile__badge--person" };
  if (data.available)                  return { text: "✔ Clear",   cls: "cam-tile__badge--clear" };
  return null;
}
