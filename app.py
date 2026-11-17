# from fastapi import FastAPI
# from config import APP_NAME
# from camera_detector import detect_once

# app = FastAPI(title=APP_NAME)

# @app.get("/")
# def home():
#     return {"message": f"{APP_NAME} is running"}

# @app.get("/health")
# def health():
#     return {"status": "ok"}

# @app.get("/detect")
# def detect():
#     return detect_once()

from datetime import datetime, timedelta

from fastapi import Body, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from camera_detector import (
    camera_available,
    detect_person,
    get_camera_inventory,
    get_camera_preview,
    probe_camera,
    start_detection_worker,
    get_detection_imgsz,
    set_detection_imgsz,
    get_camera_counts,
    reset_camera_counts,
)
from config import APP_NAME
from safety_detector import safety_model_status
from threat_detector import (
    trigger_alarm,
    silence_alarm,
    reset_alarm,
    auto_clear_alarm,
    get_alarm_state,
)
import trainer as _trainer

app = FastAPI(title=APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security_state = {
    "armed": False,
    "monitoring_enabled": True,
    "camera_ready": True,
    "last_detection": None,
}

security_events = []
detection_history = []
last_reported_detection = {}
REPORT_COOLDOWN = timedelta(seconds=15)


def initialize_security_state():
    security_state["armed"] = False
    security_state["monitoring_enabled"] = True
    security_state["camera_ready"] = True
    security_state["last_detection"] = None
    security_events.clear()
    detection_history.clear()
    last_reported_detection.clear()


def add_event(event_type: str, message: str):
    security_events.insert(
        0,
        {
            "type": event_type,
            "message": message,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        },
    )
    if len(security_events) > 10:
        security_events.pop()


def report_detection(detection):
    """
    Record a detection event to the event log and detection history.

    WHY TWO DIFFERENT COOLDOWNS?
    • REPORT_COOLDOWN (15 s) — governs how often events are written to the
      event log.  Prevents log flooding from a sustained detection.
    • Alarm cooldown (3 s, in threat_detector.py) — governs how often the
      audio alarm fires.  More frequent so the alarm keeps ringing during
      a sustained threat without hammering the event log.
    They are intentionally separate so the user gets an audio reminder every
    3 seconds but the activity feed only records one entry per 15 seconds.
    """
    camera_id = detection.get("camera_id", "front-door")
    now = datetime.now()
    previous_report = last_reported_detection.get(camera_id)
    if previous_report and now - previous_report < REPORT_COOLDOWN:
        # Still within cooldown — fire alarm but don't write to log
        alarm_type = detection.get("alarm_type")
        if alarm_type and security_state["armed"]:
            trigger_alarm(alarm_type, camera_id)
        return False

    last_reported_detection[camera_id] = now

    # Determine the event type for frontend severity filtering
    threat_level = detection.get("threat_level", "LOW")
    if threat_level == "CRITICAL":
        event_type = "critical"
    elif threat_level == "HIGH":
        event_type = "danger"
    else:
        event_type = "detection"

    add_event(event_type, f"{camera_id}: {detection.get('message', 'Activity detected')}")
    security_state["last_detection"] = detection.get("message")

    # Enrich history entry with threat level so the Training page and
    # history table can show severity alongside confidence
    detection_history.append({
        "timestamp":       now.strftime("%H:%M:%S"),
        "camera_id":       camera_id,
        "confidence":      detection.get("confidence", 0),
        "threat_level":    threat_level,
        "threat_category": detection.get("threat_category", "motion"),
        "message":         detection.get("message", ""),
    })
    if len(detection_history) > 24:   # increased from 12 → 24 to keep more history
        detection_history.pop(0)

    # Trigger audio alarm for CRITICAL/HIGH threats when system is armed
    alarm_type = detection.get("alarm_type")
    if alarm_type and security_state["armed"]:
        reset_alarm()   # re-arm if previously silenced by user
        trigger_alarm(alarm_type, camera_id)

    return True


@app.get("/")
def home():
    return {"message": f"{APP_NAME} is running"}


@app.get("/health")
def health():
    return {"status": "ok", "safety_model": safety_model_status()}


@app.get("/safety-alerts")
def safety_alert_status():
    status = safety_model_status()
    return {
        "available": status["available"],
        "message": status["message"],
        "model_path": status["model_path"],
        "supported_labels": status["supported_labels"],
        "harmful_activity_detected": False,
        "alert_level": "none" if not status["available"] else "ready",
    }


@app.on_event("startup")
def startup_event():
    initialize_security_state()
    start_detection_worker()


@app.get("/status")
def get_status():
    return {
        "armed": security_state["armed"],
        "monitoring_enabled": security_state["monitoring_enabled"],
        "camera_ready": security_state["camera_ready"],
        "last_detection": security_state["last_detection"],
        "system_mode": "armed" if security_state["armed"] else "disarmed",
    }


@app.get("/api/live-status")
def get_live_status_api():
    status = get_status()
    cameras = get_camera_inventory()
    return {
        "system": status,
        "cameras": cameras,
        "online_count": sum(camera["online"] for camera in cameras),
        "last_event": security_events[0] if security_events else None,
    }


@app.get("/api/alerts")
def get_alerts_api():
    return {
        "alerts": security_events,
        "detection_history": detection_history,
        "count": len(security_events),
    }


@app.get("/api/system-toggle")
@app.post("/api/system-toggle")
def system_toggle_api(payload: dict = Body(...)):
    if payload is not None and "armed" in payload:
        armed = bool(payload.get("armed"))
        security_state["armed"] = armed
        add_event("system", "System armed" if armed else "System disarmed")
        return {"armed": security_state["armed"], "system_mode": "armed" if armed else "disarmed"}

    return {
        "armed": security_state["armed"],
        "monitoring_enabled": security_state["monitoring_enabled"],
        "system_mode": "armed" if security_state["armed"] else "disarmed",
    }


@app.post("/status/arm")
def arm_system():
    security_state["armed"] = True
    add_event("system", "System armed")
    return {"armed": True, "system_mode": "armed"}


@app.post("/status/disarm")
def disarm_system():
    security_state["armed"] = False
    security_state["last_detection"] = None
    add_event("system", "System disarmed")
    return {"armed": False, "system_mode": "disarmed"}


@app.get("/events")
def get_events():
    return security_events


@app.get("/summary")
def get_summary():
    last_event = security_events[0] if security_events else {
        "message": "No activity recorded",
        "timestamp": "--",
        "type": "system",
    }
    cameras = get_camera_inventory()
    online_cameras = sum(camera["online"] for camera in cameras)
    detection_count = sum(event["type"] == "detection" for event in security_events)
    if not security_state["armed"]:
        ai_summary = "System is disarmed. Monitoring is paused until you arm the perimeter."
    elif detection_count:
        ai_summary = f"AI recorded {detection_count} detection event(s). Review the latest alert and camera feed."
    elif online_cameras:
        ai_summary = "Perimeter is armed. AI is watching the available camera feeds."
    else:
        ai_summary = "Perimeter is armed, but no camera feed is currently available."

    if last_event["type"] == "detection":
        ai_summary = f"Evidence report: {last_event['message']}. YOLO confidence and camera source are shown in the activity feed."

    return {
        "armed": security_state["armed"],
        "monitoring_enabled": security_state["monitoring_enabled"],
        "camera_ready": security_state["camera_ready"],
        "system_mode": "armed" if security_state["armed"] else "disarmed",
        "event_count": len(security_events),
        "detection_count": detection_count,
        "camera_count": len(cameras),
        "online_cameras": online_cameras,
        "ai_summary": ai_summary,
        "ai_model": "YOLOv8n / COCO person detector",
        "last_event": last_event["message"],
        "last_event_time": last_event["timestamp"],
        "last_event_type": last_event["type"],
        "detection_history": detection_history,
        "safety_scope": "Person and supported-object detection only; intent and harmful activity require a specialized safety model.",
        "safety_model": safety_model_status(),
    }


@app.get("/settings/monitoring")
def get_monitoring_setting():
    return {"enabled": security_state["monitoring_enabled"]}


@app.post("/settings/monitoring")
def set_monitoring_setting(payload: dict = Body(...)):
    security_state["monitoring_enabled"] = bool(payload.get("enabled", True))
    return {"enabled": security_state["monitoring_enabled"]}


@app.get("/settings/detection")
def get_detection_settings():
    """
    Returns the current detection resolution (imgsz).
    Higher imgsz = better far-away detection, slower processing.
    Presets: 320 (close), 480 (balanced), 640 (far), 1280 (max).
    """
    imgsz = get_detection_imgsz()
    preset_map = {320: "close", 480: "balanced", 640: "far", 1280: "max"}
    return {
        "imgsz": imgsz,
        "preset": preset_map.get(imgsz, "custom"),
        "available_presets": [
            {"label": "Close (fast)",    "imgsz": 320,  "description": "Best for nearby subjects, ~50-100ms"},
            {"label": "Balanced",        "imgsz": 480,  "description": "Good middle ground, ~100-200ms"},
            {"label": "Far (accurate)",  "imgsz": 640,  "description": "Detects distant people, ~200-400ms"},
            {"label": "Max detail",      "imgsz": 1280, "description": "Maximum accuracy, ~500ms+, high CPU"},
        ],
    }


@app.post("/settings/detection")
def set_detection_settings(payload: dict = Body(...)):
    """
    Change detection resolution at runtime — no server restart needed.
    Send: { "imgsz": 640 }
    Value is snapped to nearest valid size: 320, 480, 640, or 1280.
    """
    requested = int(payload.get("imgsz", 320))
    applied   = set_detection_imgsz(requested)
    preset_map = {320: "close", 480: "balanced", 640: "far", 1280: "max"}
    return {
        "imgsz":   applied,
        "preset":  preset_map.get(applied, "custom"),
        "message": f"Detection resolution set to {applied}px",
    }


@app.get("/security")
def security():
    detection = detect_person("front-door")
    security_state["camera_ready"] = camera_available()
    if security_state["armed"] and security_state["monitoring_enabled"]:
        if detection.get("harmful_activity_detected"):
            report_detection({**detection, "message": detection.get("safety_message", "Potential harmful activity detected")})
        elif detection.get("person_detected"):
            report_detection(detection)
    return {
        **detection,
        "armed": security_state["armed"],
        "system_mode": "armed" if security_state["armed"] else "disarmed",
    }


@app.get("/cameras")
def cameras():
    inventory = get_camera_inventory()
    return {
        "camera_count": len(inventory),
        "online_cameras": sum(camera["online"] for camera in inventory),
        "cameras": inventory,
    }


def camera_frame_for(camera_id: str, force_probe: bool = False):
    preview = probe_camera(camera_id) if force_probe else get_camera_preview(camera_id)
    if preview is None:
        if camera_id == "front-door":
            security_state["camera_ready"] = False
        return {
            "camera_id": camera_id,
            "available": False,
            "camera_ready": False,
            "message": "Camera unavailable",
            "image": None,
        }

    camera_available_flag = bool(preview.get("image")) and preview.get("message") != "Camera unavailable"
    if camera_id == "front-door":
        security_state["camera_ready"] = camera_available_flag

    if security_state["armed"] and security_state["monitoring_enabled"] and camera_available_flag:
        threat_level = preview.get("threat_level", "LOW")
        alarm_type   = preview.get("alarm_type")

        if alarm_type and threat_level == "CRITICAL":
            # Active CRITICAL threat — fire alarm
            trigger_alarm(alarm_type, camera_id)
        else:
            # No CRITICAL threat on this frame — clear alarm so panel hides
            auto_clear_alarm()

        # Write to event log (gated by 15-second REPORT_COOLDOWN)
        if preview.get("harmful_activity_detected"):
            report_detection({**preview, "camera_id": camera_id,
                              "message": preview.get("message", "Harmful activity detected")})
        elif preview.get("intrusion_detected") or preview.get("person_detected"):
            report_detection({**preview, "camera_id": camera_id})
    else:
        # System not armed or monitoring off — always clear the alarm
        auto_clear_alarm()

    return {
        "camera_id":        camera_id,
        "available":        camera_available_flag,
        "camera_ready":     camera_available_flag,
        "message":          "Camera stream active" if camera_available_flag else "Camera unavailable",
        "image":            preview["image"],
        "person_detected":  preview["person_detected"],
        "person_count":     preview.get("person_count", 0),
        "count_in":         preview.get("count_in", 0),
        "count_out":        preview.get("count_out", 0),
        "label":            preview["label"],
        "confidence":       preview["confidence"],
        "detection_message":preview["message"],
        "latency_ms":       preview["latency_ms"],
        # ── Threat fields ──
        "harmful_activity_detected": preview.get("harmful_activity_detected", False),
        "threat_level":    preview.get("threat_level",    "CLEAR"),
        "threat_category": preview.get("threat_category", "clear"),
        "threat_label":    preview.get("threat_label",    ""),
        "alarm_type":      preview.get("alarm_type",       None),
        "fire_detected":   preview.get("fire_detected",    False),
        "fire_confidence": preview.get("fire_confidence",  0.0),
        "fight_detected":  preview.get("fight_detected",   False),
        "fight_confidence":preview.get("fight_confidence", 0.0),
        "weapon_detected": preview.get("weapon_detected",  False),
        "weapon_label":    preview.get("weapon_label",     None),
        # ── ROI fields ──
        "intrusion_detected": preview.get("intrusion_detected", False),
        "near_zone_detected": preview.get("near_zone_detected", False),
        # ── Legacy safety fields ──
        "safety_label":      preview.get("safety_label"),
        "safety_confidence": preview.get("safety_confidence", 0.0),
        "monitoring_enabled":security_state["monitoring_enabled"],
        "alarm_state":       get_alarm_state(),
    }


@app.post("/cameras/{camera_id}/counts/reset")
def reset_counts(camera_id: str):
    """Reset the in/out person counter for a specific camera."""
    reset_camera_counts(camera_id)
    return {"camera_id": camera_id, "reset": True, "count_in": 0, "count_out": 0}


@app.get("/camera/frame")
def camera_frame():
    return camera_frame_for("front-door")


@app.post("/camera/test")
def test_camera_connection():
    return camera_frame_for("front-door", force_probe=True)


@app.get("/cameras/{camera_id}/frame")
def camera_frame_by_id(camera_id: str):
    return camera_frame_for(camera_id)


# =============================================================================
# Alarm endpoints
# =============================================================================

@app.get("/api/alarm")
def get_alarm():
    """
    Returns the current alarm state.
    Frontend polls this to know whether to show the flashing alarm panel.
      active   : bool — alarm is currently firing
      silenced : bool — user silenced it (will re-arm on next CRITICAL event)
      category : str | None — "fire" | "fight" | "weapon" | "intrusion"
    """
    return get_alarm_state()


@app.post("/api/alarm/silence")
def silence_alarm_endpoint():
    """
    Silence the active alarm.
    The alarm will re-arm automatically on the next CRITICAL detection.
    This does NOT disarm the security system — monitoring continues.
    """
    silence_alarm()
    return {"silenced": True, "message": "Alarm silenced. System remains armed."}


@app.post("/api/alarm/reset")
def reset_alarm_endpoint():
    """
    Reset a previously silenced alarm so it can fire again immediately.
    Use this after the user has assessed the situation and wants to
    re-enable audio alerts without a new detection triggering.
    """
    reset_alarm()
    return {"reset": True, "message": "Alarm re-armed."}


# =============================================================================
# Feedback & Training endpoints
# =============================================================================

@app.post("/api/feedback")
def submit_feedback(payload: dict = Body(...)):
    """
    Save a user-labelled frame for model fine-tuning.

    Payload:
      image       : str   — base64 JPEG (with or without data URI prefix)
      label       : str   — "correct" | "false_alarm"
      camera_id   : str   — which camera the frame came from
      persons     : list  — list of {box:[x1,y1,x2,y2], confidence:float}
      frame_w     : int   — frame width  (default 640)
      frame_h     : int   — frame height (default 480)

    A "correct" frame with its bounding boxes teaches the model what a real
    person looks like in this environment.
    A "false_alarm" frame with an empty label file teaches the model to stop
    firing on this kind of non-threatening scene.
    """
    result = _trainer.save_feedback(
        image_b64 = payload.get("image", ""),
        label     = payload.get("label", "correct"),
        camera_id = payload.get("camera_id", "front-door"),
        persons   = payload.get("persons", []),
        frame_w   = int(payload.get("frame_w", 640)),
        frame_h   = int(payload.get("frame_h", 480)),
    )
    return result


@app.get("/api/feedback/stats")
def feedback_stats():
    """
    Returns counts of collected feedback samples and whether training is
    unlocked (requires ≥10 samples).
    """
    return _trainer.get_feedback_stats()


@app.post("/api/feedback/train")
def start_training(payload: dict = Body(default={})):
    """
    Start fine-tuning YOLOv8n on the collected feedback data in a
    background thread.  Returns immediately with {started: true/false}.

    Optional payload:
      epochs        : int  — training epochs (default 20)
      base_weights  : str  — starting checkpoint (default "yolov8n.pt")

    WHY USER CONSENT BEFORE TRAINING?
    The frontend only triggers this endpoint when the user explicitly clicks
    "Start Training" and confirms the dialog. This ensures:
      • The user understands the model is being modified
      • There are enough samples to produce a meaningful update
      • Training doesn't start automatically in the background
    """
    epochs       = int(payload.get("epochs", 20))
    base_weights = payload.get("base_weights", "yolov8n.pt")
    return _trainer.start_training(epochs=epochs, base_weights=base_weights)


@app.get("/api/feedback/train/status")
def training_status():
    """
    Poll training progress.  Returns:
      status   : "idle" | "running" | "done" | "error"
      progress : 0-100
      epoch    : current epoch
      message  : human-readable status string
      best_weights : path to best.pt when done (None otherwise)
    """
    return _trainer.get_training_status()
