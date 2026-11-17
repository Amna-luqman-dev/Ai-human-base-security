/* =========================================================================
   api.js – single source of truth for backend communication
   -------------------------------------------------------------------------
   Every function here maps to one backend endpoint.  The UI layer (main.js)
   calls these functions and never touches `fetch` directly.  This separation
   means:
     • URL changes only happen here.
     • Error handling is consistent across the app.
     • The functions are easy to test or mock independently.
   ========================================================================= */

// Low-level wrapper – every API call funnels through here so we get consistent
// error handling and JSON parsing.  If the response is not OK we throw a clear
// error that the caller can catch.
async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} – ${path}`);
  }

  return res.json();
}

/* ----- System status & control ----- */

// GET /status – armed state, monitoring flag, camera readiness
export function getStatus() {
  return request("/status");
}

// POST /status/arm – arm the perimeter
export function armSystem() {
  return request("/status/arm", { method: "POST" });
}

// POST /status/disarm – disarm the perimeter
export function disarmSystem() {
  return request("/status/disarm", { method: "POST" });
}

/* ----- Live status (aggregated) ----- */

// GET /api/live-status – system status + camera inventory + online count + last event
export function getLiveStatus() {
  return request("/api/live-status");
}

/* ----- Alerts & history ----- */

// GET /api/alerts – recent security events + detection history
export function getAlerts() {
  return request("/api/alerts");
}

/* ----- Summary ----- */

// GET /summary – AI-generated summary, camera stats, detection count, safety model
export function getSummary() {
  return request("/summary");
}

/* ----- Camera frames ----- */

// GET /cameras/{id}/frame – live JPEG (base64) with detection overlay + metadata
export function getCameraFrame(cameraId = "front-door") {
  return request(`/cameras/${encodeURIComponent(cameraId)}/frame`);
}

// POST /camera/test – force re-probe the front-door camera
export function testCamera() {
  return request("/camera/test", { method: "POST" });
}

/* ----- On-demand security scan ----- */

// GET /security – runs detect_person("front-door") live, auto-reports if
// armed+monitoring, and returns the full detection dict.
// Used by the "Scan Now" button for on-demand checks.
export function scanNow() {
  return request("/security");
}

/* ----- Safety alert status ----- */

// GET /safety-alerts – dedicated safety model status: available, alert_level
// ("none"|"ready"), harmful_activity_detected flag, supported_labels.
export function getSafetyAlerts() {
  return request("/safety-alerts");
}

/* ----- Monitoring setting ----- */

// GET /settings/monitoring – current monitoring enabled/disabled state
export function getMonitoringSetting() {
  return request("/settings/monitoring");
}

// POST /settings/monitoring – set monitoring on or off
// payload: { enabled: true | false }
export function setMonitoring(enabled) {
  return request("/settings/monitoring", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

/* ----- Detection resolution ----- */

// GET /settings/detection – current imgsz + all available presets
export function getDetectionSettings() {
  return request("/settings/detection");
}

// POST /settings/detection – change imgsz at runtime, no restart needed
// payload: { imgsz: 320 | 480 | 640 | 1280 }
export function setDetectionImgsz(imgsz) {
  return request("/settings/detection", {
    method: "POST",
    body: JSON.stringify({ imgsz }),
  });
}

/* ----- Health & safety ----- */

// GET /health – basic health check + safety model availability.
// Used for the connection status indicator — short timeout so we detect
// failures quickly rather than waiting for the default browser timeout.
export async function getHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000); // 4 s timeout
  try {
    const res = await fetch("/health", { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/* ----- Person count reset ----- */

// POST /cameras/{id}/counts/reset — reset in/out counter for one camera
export function resetCameraCounts(cameraId) {
  return request(`/cameras/${encodeURIComponent(cameraId)}/counts/reset`, {
    method: "POST",
  });
}

/* ----- Feedback & model training ----- */

// POST /api/feedback — submit a labelled frame for fine-tuning
// payload: { image, label, camera_id, persons, frame_w, frame_h }
//   label: "correct" = real detection, "false_alarm" = misfire
export function submitFeedback(payload) {
  return request("/api/feedback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// GET /api/feedback/stats — collected sample counts + can_train flag
export function getFeedbackStats() {
  return request("/api/feedback/stats");
}

// POST /api/feedback/train — start fine-tuning in a background thread
// payload: { epochs?: number, base_weights?: string }
// Returns immediately: { started: bool, reason?: string }
export function triggerTraining(payload = {}) {
  return request("/api/feedback/train", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// GET /api/feedback/train/status — poll training progress
// Returns: { status, progress, epoch, total_epochs, message, best_weights, error }
export function getTrainingStatus() {
  return request("/api/feedback/train/status");
}

/* ----- Alarm endpoints ----- */

// GET /api/alarm — current alarm state: { active, silenced, category }
export function getAlarm() {
  return request("/api/alarm");
}

// POST /api/alarm/silence — silence active alarm (system stays armed)
export function silenceAlarm() {
  return request("/api/alarm/silence", { method: "POST" });
}

// POST /api/alarm/reset — re-arm a silenced alarm
export function resetAlarmApi() {
  return request("/api/alarm/reset", { method: "POST" });
}
