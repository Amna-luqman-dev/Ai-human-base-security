/* =========================================================================
   training.js — Model feedback & fine-tuning page
   =========================================================================
   This page closes the loop between the camera feed and the AI model.
   The full flow:

     1. USER LABELS DETECTIONS  (Cameras page → zoom modal → ✔/✗ buttons)
        Every click sends the frame + label to POST /api/feedback.
        The backend saves a JPEG + YOLO .txt label file to feedback_data/.

     2. SAMPLES ACCUMULATE HERE  (this page shows the stats)
        A progress bar fills as samples are collected.
        10 samples = minimum to unlock training.

     3. USER REVIEWS & CONFIRMS
        The user sees a breakdown: how many correct / false alarm samples,
        a table of recent submissions, and what training will do.
        They must click "Start Training" and confirm the dialog before
        anything happens — the model is never modified automatically.

     4. TRAINING RUNS IN THE BACKGROUND
        POST /api/feedback/train starts a background thread on the backend.
        This page polls GET /api/feedback/train/status every 2 s and shows
        a live progress bar + epoch counter while training runs.

     5. DONE — best.pt is ready
        When training finishes, the path to best.pt is shown.
        The user can copy it to replace yolov8n.pt and restart the backend.

   WHY NOT AUTO-APPLY THE NEW WEIGHTS?
   Replacing the model file requires a server restart and could break the
   system if the new weights are worse. Showing the path and requiring a
   manual step keeps the operator in control and makes the change auditable.
   ========================================================================= */

import { getFeedbackStats, triggerTraining, getTrainingStatus } from "../api.js";

export const TrainingPage = {
  _intervals:     [],
  _stats:         null,
  _trainingStatus: null,

  mount(container) {
    container.innerHTML = this._template();
    this._bindElements();
    this._fetchAll();
    this._intervals = [
      setInterval(() => this._fetchStats(), 5000),     // stats refresh
      setInterval(() => this._pollTraining(), 2000),   // training progress
    ];
  },

  unmount() {
    this._intervals.forEach(clearInterval);
    this._intervals = [];
  },

  // ── Template ─────────────────────────────────────────────────────────────
  _template() {
    return `
      <div class="page">
        <div class="page__header">
          <h2 class="page__title">Model Training</h2>
          <span class="page__sub">Label detections on the Cameras page · Collect samples · Fine-tune the AI model</span>
        </div>

        <!-- ── How it works banner ───────────────────────────────────────── -->
        <div class="training-how">
          <div class="training-step">
            <span class="training-step__num">1</span>
            <div class="training-step__body">
              <strong>Label Detections</strong>
              <span>Open any camera → zoom → click ✔ Correct or ✗ False Alarm</span>
            </div>
          </div>
          <div class="training-step__arrow">→</div>
          <div class="training-step">
            <span class="training-step__num">2</span>
            <div class="training-step__body">
              <strong>Collect 10+ Samples</strong>
              <span>A mix of correct detections and false alarms works best</span>
            </div>
          </div>
          <div class="training-step__arrow">→</div>
          <div class="training-step">
            <span class="training-step__num">3</span>
            <div class="training-step__body">
              <strong>Fine-Tune the Model</strong>
              <span>Start training below — runs on the server, takes a few minutes</span>
            </div>
          </div>
          <div class="training-step__arrow">→</div>
          <div class="training-step">
            <span class="training-step__num">4</span>
            <div class="training-step__body">
              <strong>Apply New Weights</strong>
              <span>Copy best.pt → replace yolov8n.pt → restart the backend</span>
            </div>
          </div>
        </div>

        <div class="training-body">

          <!-- ── LEFT: Feedback stats ────────────────────────────────────── -->
          <div class="training-col">

            <div class="card training-card">
              <div class="card__title">Feedback Samples</div>

              <!-- Collection progress -->
              <div class="sample-progress">
                <div class="sample-progress__labels">
                  <span id="sample-total">0 samples collected</span>
                  <span id="sample-min-label" class="sample-progress__min">10 needed to train</span>
                </div>
                <div class="sample-progress__bar-wrap">
                  <div class="sample-progress__bar" id="sample-bar"></div>
                </div>
              </div>

              <!-- Stat cards row -->
              <div class="sample-stats">
                <div class="sample-stat">
                  <span class="sample-stat__icon sample-stat__icon--ok">✔</span>
                  <span class="sample-stat__value" id="stat-correct">0</span>
                  <span class="sample-stat__label">Correct</span>
                </div>
                <div class="sample-stat">
                  <span class="sample-stat__icon sample-stat__icon--err">✗</span>
                  <span class="sample-stat__value" id="stat-false">0</span>
                  <span class="sample-stat__label">False Alarms</span>
                </div>
                <div class="sample-stat">
                  <span class="sample-stat__icon">📦</span>
                  <span class="sample-stat__value" id="stat-total">0</span>
                  <span class="sample-stat__label">Total</span>
                </div>
              </div>

              <!-- Recent samples table -->
              <div class="card__title" style="margin-top:14px">Recent Submissions</div>
              <div id="samples-table-wrap" class="samples-table-wrap">
                <p class="history__empty">No samples yet — label detections on the Cameras page.</p>
              </div>
            </div>

          </div>

          <!-- ── RIGHT: Training controls + status ──────────────────────── -->
          <div class="training-col">

            <!-- Train button card -->
            <div class="card training-card">
              <div class="card__title">Fine-Tune Model</div>

              <p class="training-desc">
                Fine-tuning adjusts the YOLOv8n weights to your specific environment.
                <strong>Correct</strong> samples teach it what real detections look like.
                <strong>False alarm</strong> samples teach it what NOT to fire on.
              </p>

              <!-- Epoch selector -->
              <div class="epoch-row">
                <label class="epoch-row__label" for="epoch-input">
                  Training epochs
                  <span class="epoch-row__hint">(more = better accuracy, longer time)</span>
                </label>
                <div class="epoch-row__controls">
                  <button class="epoch-btn" id="epoch-dec">−</button>
                  <span   class="epoch-val" id="epoch-val">20</span>
                  <button class="epoch-btn" id="epoch-inc">+</button>
                </div>
              </div>
              <div class="epoch-presets">
                <button class="epoch-preset" data-epochs="10">10 · Fast (~3 min)</button>
                <button class="epoch-preset" data-epochs="20">20 · Balanced (~6 min)</button>
                <button class="epoch-preset" data-epochs="50">50 · Thorough (~15 min)</button>
              </div>

              <!-- Start button -->
              <button class="btn-train" id="btn-start-train" disabled>
                <span id="btn-train-text">Start Training</span>
              </button>
              <p class="train-unlock-msg" id="train-unlock-msg">
                Collect at least 10 samples to unlock training.
              </p>
            </div>

            <!-- Training progress card — hidden until training starts -->
            <div class="card training-card" id="training-progress-card" style="margin-top:10px; display:none">
              <div class="card__title">
                Training Progress
                <span class="train-status-badge" id="train-status-badge">idle</span>
              </div>

              <!-- Epoch progress bar -->
              <div class="train-progress-wrap">
                <div class="train-progress-bar" id="train-progress-bar"></div>
              </div>
              <div class="train-progress-labels">
                <span id="train-epoch-label">Epoch 0 / 0</span>
                <span id="train-pct-label">0%</span>
              </div>

              <!-- Status message -->
              <p class="train-message" id="train-message">—</p>

              <!-- Elapsed time -->
              <p class="train-elapsed" id="train-elapsed"></p>

              <!-- Result — shown when done -->
              <div id="train-result" class="train-result" style="display:none">
                <div class="train-result__title">Training complete ✔</div>
                <div class="train-result__body">
                  <p>New weights saved to:</p>
                  <code id="train-weights-path" class="train-weights-path"></code>
                  <div class="train-result__steps">
                    <div class="train-result__step">1. Copy <code>best.pt</code> to the project root</div>
                    <div class="train-result__step">2. Rename it to <code>yolov8n.pt</code> (or update DETECTION_MODEL in .env)</div>
                    <div class="train-result__step">3. Restart the backend: <code>uvicorn app:app --reload</code></div>
                  </div>
                </div>
              </div>

              <!-- Error — shown on failure -->
              <div id="train-error" class="train-error" style="display:none">
                <strong>Training failed</strong>
                <p id="train-error-msg"></p>
              </div>
            </div>

          </div>

        </div>
      </div>
    `;
  },

  // ── DOM bindings ──────────────────────────────────────────────────────────
  _bindElements() {
    this._epochs = 20;
    this._updateEpochDisplay();

    document.getElementById("epoch-dec")?.addEventListener("click", () => {
      this._epochs = Math.max(5, this._epochs - 5);
      this._updateEpochDisplay();
    });
    document.getElementById("epoch-inc")?.addEventListener("click", () => {
      this._epochs = Math.min(200, this._epochs + 5);
      this._updateEpochDisplay();
    });
    document.querySelectorAll(".epoch-preset").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._epochs = parseInt(btn.dataset.epochs);
        this._updateEpochDisplay();
        document.querySelectorAll(".epoch-preset").forEach((b) =>
          b.classList.toggle("epoch-preset--active", b === btn));
      });
    });

    document.getElementById("btn-start-train")?.addEventListener("click", () =>
      this._confirmAndTrain());
  },

  _updateEpochDisplay() {
    const el = document.getElementById("epoch-val");
    if (el) el.textContent = this._epochs;
  },

  // ── Data fetch ────────────────────────────────────────────────────────────
  async _fetchAll() {
    await Promise.allSettled([this._fetchStats(), this._pollTraining()]);
  },

  async _fetchStats() {
    try {
      const stats = await getFeedbackStats();
      this._stats = stats;
      this._renderStats(stats);
    } catch (err) { console.error("Feedback stats:", err.message); }
  },

  async _pollTraining() {
    try {
      const status = await getTrainingStatus();
      this._trainingStatus = status;
      this._renderTrainingStatus(status);
    } catch {}
  },

  // ── Render feedback stats ─────────────────────────────────────────────────
  _renderStats(stats) {
    const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    set("stat-correct", stats.correct);
    set("stat-false",   stats.false_alarm);
    set("stat-total",   stats.total);

    // Progress bar — fills from 0 to 100% at 10 samples
    const pct = Math.min(100, (stats.total / stats.min_for_train) * 100);
    const bar = document.getElementById("sample-bar");
    if (bar) {
      bar.style.width = pct + "%";
      bar.className   = `sample-progress__bar ${pct >= 100 ? "sample-progress__bar--ready" : ""}`;
    }
    set("sample-total", `${stats.total} sample${stats.total !== 1 ? "s" : ""} collected`);

    // Unlock training button
    const btn     = document.getElementById("btn-start-train");
    const msgEl   = document.getElementById("train-unlock-msg");
    const minLabel = document.getElementById("sample-min-label");
    if (btn) btn.disabled = !stats.can_train || (this._trainingStatus?.status === "running");
    if (msgEl) msgEl.style.display = stats.can_train ? "none" : "";
    if (minLabel) minLabel.textContent = stats.can_train
      ? "Ready to train ✔"
      : `${stats.min_for_train - stats.total} more needed`;

    // Recent samples table
    this._renderSamplesTable(stats.recent || []);
  },

  _renderSamplesTable(samples) {
    const wrap = document.getElementById("samples-table-wrap");
    if (!wrap) return;
    if (!samples.length) {
      wrap.innerHTML = `<p class="history__empty">No samples yet — label detections on the Cameras page.</p>`;
      return;
    }
    const rows = [...samples].reverse().map((s) => {
      const labelCls = s.label === "correct" ? "label-correct" : "label-false";
      const labelTxt = s.label === "correct" ? "✔ Correct" : "✗ False Alarm";
      return `<tr>
        <td>${s.timestamp}</td>
        <td>${s.camera_id}</td>
        <td><span class="sample-label ${labelCls}">${labelTxt}</span></td>
        <td>${s.person_count ?? "—"}</td>
      </tr>`;
    }).join("");
    wrap.innerHTML = `
      <table class="history__table samples-table">
        <thead>
          <tr><th>Time</th><th>Camera</th><th>Label</th><th>Persons</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  },

  // ── Render training progress ──────────────────────────────────────────────
  _renderTrainingStatus(status) {
    const card = document.getElementById("training-progress-card");
    if (!card) return;

    // Show card if training has ever been attempted
    if (status.status !== "idle") card.style.display = "";

    const set     = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    const show    = (id, vis) => { const e = document.getElementById(id); if (e) e.style.display = vis ? "" : "none"; };
    const setHtml = (id, val) => { const e = document.getElementById(id); if (e) e.innerHTML = val; };

    // Status badge colour
    const badge = document.getElementById("train-status-badge");
    if (badge) {
      badge.textContent = status.status;
      badge.className   = `train-status-badge train-status-badge--${status.status}`;
    }

    // Progress bar
    const bar = document.getElementById("train-progress-bar");
    if (bar) bar.style.width = (status.progress || 0) + "%";
    set("train-epoch-label", `Epoch ${status.epoch || 0} / ${status.total_epochs || 0}`);
    set("train-pct-label",   `${status.progress || 0}%`);
    set("train-message",     status.message || "—");

    // Elapsed time
    if (status.elapsed_s != null) {
      const m = Math.floor(status.elapsed_s / 60);
      const s = status.elapsed_s % 60;
      set("train-elapsed", `Elapsed: ${m}m ${s}s`);
    }

    // Result block (done)
    show("train-result", status.status === "done");
    if (status.status === "done" && status.best_weights) {
      set("train-weights-path", status.best_weights);
    }

    // Error block
    show("train-error", status.status === "error");
    if (status.status === "error") {
      set("train-error-msg", status.error || "Unknown error");
    }

    // Re-enable button when idle/done/error
    const btn = document.getElementById("btn-start-train");
    if (btn && status.status !== "running") {
      btn.disabled = !(this._stats?.can_train);
    }
  },

  // ── Confirm and start training ────────────────────────────────────────────
  // WHY A CONFIRM DIALOG?
  // Training modifies the model. The user must explicitly agree before any
  // fine-tuning happens. This prevents accidental clicks from starting a
  // multi-minute CPU-intensive job.
  async _confirmAndTrain() {
    const confirmed = window.confirm(
      `Start fine-tuning YOLOv8n for ${this._epochs} epochs?\n\n` +
      `This will use your ${this._stats?.total || 0} feedback samples to ` +
      `improve detection accuracy for your specific environment.\n\n` +
      `Training runs in the background and takes several minutes.\n` +
      `The current model continues working while training runs.`
    );
    if (!confirmed) return;

    const btn = document.getElementById("btn-start-train");
    if (btn) btn.disabled = true;

    try {
      const res = await triggerTraining({ epochs: this._epochs });
      if (!res.started) {
        window.alert(`Could not start training:\n${res.reason}`);
        if (btn) btn.disabled = !this._stats?.can_train;
        return;
      }
      // Show progress card immediately
      const card = document.getElementById("training-progress-card");
      if (card) card.style.display = "";
      const badge = document.getElementById("train-status-badge");
      if (badge) { badge.textContent = "running"; badge.className = "train-status-badge train-status-badge--running"; }
      const msgEl = document.getElementById("train-message");
      if (msgEl) msgEl.textContent = "Starting…";
    } catch (err) {
      window.alert(`Error: ${err.message}`);
      if (btn) btn.disabled = !this._stats?.can_train;
    }
  },
};
