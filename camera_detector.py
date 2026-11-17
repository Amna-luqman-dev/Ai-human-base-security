import base64
import os
import threading
import time

import cv2
import numpy as np
from dotenv import load_dotenv
from ultralytics import YOLO

from safety_detector import detect_harmful_activity

load_dotenv()

model = YOLO("yolov8s.pt")   # Small model: +5% mAP vs nano, same API
# WHY yolov8s.pt INSTEAD OF yolov8n.pt?
# nano  (yolov8n.pt,  6.2 MB): COCO mAP@0.5 = 52.0% — fastest, least accurate
# small (yolov8s.pt, 21.5 MB): COCO mAP@0.5 = 57.0% — 5% better accuracy, 2x heavier
# At our 2-second analysis cooldown the extra weight doesn't hurt real-time feel.
# The improvement is most visible for partial occlusion (person partially
# behind furniture), distant subjects, and unusual angles.
CAMERA_RETRY_SECONDS = 15
ANALYSIS_COOLDOWN_SECONDS = 2.0
CAMERA_DETECTION_ENABLED = os.getenv("ENABLE_CAMERA_DETECTION", "true").strip().lower() not in {"0", "false", "no", "disable", "disabled"}

# ── Detection resolution (imgsz) ──────────────────────────────────────────────
_DETECTION_IMGSZ = int(os.getenv("DETECTION_IMGSZ", "320"))
_imgsz_lock = threading.Lock()

def get_detection_imgsz():
    with _imgsz_lock:
        return _DETECTION_IMGSZ

def set_detection_imgsz(value: int):
    global _DETECTION_IMGSZ
    allowed = {320, 416, 480, 640, 1280}
    value = min(allowed, key=lambda x: abs(x - value))
    with _imgsz_lock:
        _DETECTION_IMGSZ = value
    return value

# ── Restricted zone config ────────────────────────────────────────────────────
_ROI_X   = float(os.getenv("ROI_X",  "0.05"))
_ROI_Y   = float(os.getenv("ROI_Y",  "0.06"))
_ROI_W   = float(os.getenv("ROI_W",  "0.17"))
_ROI_H   = float(os.getenv("ROI_H",  "0.22"))
_ROI_PROXIMITY_PX = int(os.getenv("ROI_PROXIMITY_PX", "15"))

# ── In/Out crossing-line tracker ──────────────────────────────────────────────
# The "crossing line" is drawn horizontally at LINE_Y_FRAC of the frame height.
# A person is tracked between frames by IoU matching of their bounding boxes.
# When a tracked person's center crosses the line (top→bottom = IN, bottom→top = OUT)
# the camera's counter increments.
#
# Why IoU matching instead of a dedicated tracker library?
# It works without extra dependencies and is fast enough at our 2-second cooldown.
# Each camera keeps its own tracker state independently.
LINE_Y_FRAC  = float(os.getenv("COUNT_LINE_Y", "0.55"))   # 55% down the frame
IOU_THRESHOLD = 0.25   # minimum overlap to consider two boxes the same person

class _CameraTracker:
    """Per-camera person tracker for in/out counting."""
    def __init__(self):
        self.count_in   = 0
        self.count_out  = 0
        self.prev_boxes = []   # list of {"box": (x1,y1,x2,y2), "cy": float, "id": int}
        self.next_id    = 0
        self._lock      = threading.Lock()

    def update(self, boxes_xyxy: list, frame_h: int) -> dict:
        """
        boxes_xyxy: list of (x1,y1,x2,y2) for every person in the current frame.
        Returns {"count_in": int, "count_out": int, "person_count": int}
        """
        line_y = frame_h * LINE_Y_FRAC

        with self._lock:
            current = []
            used_prev = set()

            for box in boxes_xyxy:
                x1, y1, x2, y2 = box
                cy = (y1 + y2) / 2.0

                # Find best IoU match in previous frame
                best_iou  = IOU_THRESHOLD
                best_prev = None
                for j, prev in enumerate(self.prev_boxes):
                    if j in used_prev:
                        continue
                    iou = _iou(box, prev["box"])
                    if iou > best_iou:
                        best_iou  = iou
                        best_prev = j

                if best_prev is not None:
                    # Same person seen before — check for line crossing
                    used_prev.add(best_prev)
                    prev_cy = self.prev_boxes[best_prev]["cy"]
                    tid     = self.prev_boxes[best_prev]["id"]

                    if prev_cy < line_y <= cy:      # crossed downward = IN
                        self.count_in += 1
                    elif prev_cy >= line_y > cy:    # crossed upward  = OUT
                        self.count_out += 1

                    current.append({"box": box, "cy": cy, "id": tid})
                else:
                    # New person
                    current.append({"box": box, "cy": cy, "id": self.next_id})
                    self.next_id += 1

            self.prev_boxes = current
            return {
                "count_in":     self.count_in,
                "count_out":    self.count_out,
                "person_count": len(current),
            }

    def reset(self):
        with self._lock:
            self.count_in   = 0
            self.count_out  = 0
            self.prev_boxes = []


def _iou(a, b):
    """Intersection-over-Union of two (x1,y1,x2,y2) boxes."""
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1 = max(ax1, bx1); iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2); iy2 = min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    union = ((ax2 - ax1) * (ay2 - ay1) +
             (bx2 - bx1) * (by2 - by1) - inter)
    return inter / union if union > 0 else 0.0


def _resolve_camera_source(default_value, env_name):
    value = os.getenv(env_name)
    if value is None or value.strip() == "":
        return default_value
    value = value.strip().lower()
    if value in {"disable", "disabled", "false", "none", "null", "off"}:
        return None
    try:
        return int(value)
    except ValueError:
        return value


# ── Complete home security camera layout ──────────────────────────────────────
# 8 camera positions covering all entry points and exterior zones.
# Each camera maps to an environment variable so sources can be configured
# in .env without touching code. Set to "disabled" for cameras you don't have.
#
#   Zone categories:
#     Entry    – primary access points (doors, gates)
#     Exterior – outdoor perimeter views
#     Interior – indoor monitoring
#     Garage   – vehicle/storage area
CAMERA_CONFIG = (
    # ── Entry points ──
    {"id": "front-door",      "name": "Front Door",      "source": _resolve_camera_source(0,         "FRONT_DOOR_CAMERA_SOURCE"),      "zone": "Entry"},
    {"id": "back-door",       "name": "Back Door",        "source": _resolve_camera_source(None,      "BACK_DOOR_CAMERA_SOURCE"),        "zone": "Entry"},
    {"id": "side-gate",       "name": "Side Gate",        "source": _resolve_camera_source(None,      "SIDE_GATE_CAMERA_SOURCE"),        "zone": "Entry"},
    # ── Exterior perimeter ──
    {"id": "driveway",        "name": "Driveway",         "source": _resolve_camera_source(None,      "DRIVEWAY_CAMERA_SOURCE"),         "zone": "Exterior"},
    {"id": "backyard",        "name": "Backyard",         "source": _resolve_camera_source(None,      "BACKYARD_CAMERA_SOURCE"),         "zone": "Exterior"},
    {"id": "perimeter-left",  "name": "Perimeter Left",   "source": _resolve_camera_source(None,      "PERIMETER_LEFT_CAMERA_SOURCE"),   "zone": "Exterior"},
    {"id": "perimeter-right", "name": "Perimeter Right",  "source": _resolve_camera_source(None,      "PERIMETER_RIGHT_CAMERA_SOURCE"),  "zone": "Exterior"},
    # ── Interior / Garage ──
    {"id": "garage",          "name": "Garage",           "source": _resolve_camera_source(None,      "GARAGE_CAMERA_SOURCE"),           "zone": "Garage"},
    {"id": "living-room",     "name": "Living Room",      "source": _resolve_camera_source(None,      "LIVING_ROOM_CAMERA_SOURCE"),      "zone": "Interior"},
)

_cameras = {
    camera["id"]: {
        **camera,
        "capture":      None,
        "lock":         threading.Lock(),
        "last_attempt": 0.0,
        "online":       False,
        "last_detection": None,
        "last_latency_ms": 0,
        "latest_preview": None,
        "preview_lock": threading.Lock(),
        "last_analysis": 0.0,
        "tracker":      _CameraTracker(),   # per-camera in/out tracker
    }
    for camera in CAMERA_CONFIG
}
_model_lock = threading.Lock()
_worker_started = False
_worker_start_lock = threading.Lock()


def get_camera_counts(camera_id: str) -> dict:
    """Return the current in/out counts for a camera (resets are manual)."""
    cam = _cameras.get(camera_id)
    if cam is None:
        return {"count_in": 0, "count_out": 0, "person_count": 0}
    return cam["tracker"].update([], 0)   # returns cached counts without updating


def reset_camera_counts(camera_id: str):
    cam = _cameras.get(camera_id)
    if cam:
        cam["tracker"].reset()


def _get_camera(camera_id="front-door"):
    return _cameras.get(camera_id)


def _open_camera(camera):
    if not CAMERA_DETECTION_ENABLED:
        camera["capture"] = None
        camera["online"] = False
        return None

    if camera["source"] is None:
        camera["capture"] = None
        camera["online"] = False
        return None

    capture = camera["capture"]
    if capture is not None and capture.isOpened():
        return capture

    now = time.monotonic()
    if now - camera["last_attempt"] < CAMERA_RETRY_SECONDS:
        return None

    camera["last_attempt"] = now
    try:
        capture = cv2.VideoCapture(camera["source"], cv2.CAP_ANY)
    except Exception:
        capture = None

    if capture is None or not capture.isOpened():
        if capture is not None:
            capture.release()
        camera["capture"] = None
        camera["online"] = False
        return None

    camera["capture"] = capture
    camera["online"] = True
    return capture


def open_camera(camera_id="front-door"):
    camera = _get_camera(camera_id)
    if camera is None:
        return None

    with camera["lock"]:
        return _open_camera(camera)


def get_camera_frame(camera_id="front-door"):
    camera = _get_camera(camera_id)
    if camera is None:
        return None

    with camera["lock"]:
        capture = _open_camera(camera)
        if capture is None:
            return None

        ret, frame = capture.read()
        if ret:
            return frame

        capture.release()
        camera["capture"] = None
        camera["online"] = False
        return None


def probe_camera(camera_id="front-door"):
    camera = _get_camera(camera_id)
    if camera is None:
        return None

    with camera["lock"]:
        camera["last_attempt"] = 0.0
    with camera["preview_lock"]:
        camera["latest_preview"] = None
        camera["last_analysis"] = 0.0
    return get_camera_preview(camera_id)


def camera_available(camera_id="front-door"):
    camera = _get_camera(camera_id)
    return bool(camera and camera["online"])


def get_camera_inventory():
    return [
        {
            "id": camera["id"],
            "name": camera["name"],
            "zone": camera["zone"],
            "source": camera["source"],
            "online": camera["online"],
            "last_detection": camera["last_detection"],
            "last_latency_ms": camera["last_latency_ms"],
            "has_preview": camera["latest_preview"] is not None,
        }
        for camera in _cameras.values()
    ]


def draw_roi(frame):
    height, width = frame.shape[:2]
    roi = {
        "x": int(width  * _ROI_X),
        "y": int(height * _ROI_Y),
        "w": int(width  * _ROI_W),
        "h": int(height * _ROI_H),
    }
    # Draw the restricted zone rectangle — cyan outline, semi-transparent fill
    x, y, w, h = roi["x"], roi["y"], roi["w"], roi["h"]
    overlay = frame.copy()
    cv2.rectangle(overlay, (x, y), (x + w, y + h), (0, 255, 255), -1)   # filled
    cv2.addWeighted(overlay, 0.08, frame, 0.92, 0, frame)               # blend
    cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 255), 2)     # border
    cv2.putText(frame, "Restricted Zone", (x + 6, y + 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 1)
    return roi


def person_inside_roi(box_xyxy, roi):
    """Return True if the person bounding box overlaps the ROI rectangle."""
    if roi is None:
        return False
    x1, y1, x2, y2 = box_xyxy
    rx, ry, rw, rh = roi["x"], roi["y"], roi["w"], roi["h"]
    # Overlap: NOT (fully to the left | right | above | below)
    return not (x2 < rx or x1 > rx + rw or y2 < ry or y1 > ry + rh)


def person_near_roi(box_xyxy, roi, margin_px=None):
    """Return True if the person is within margin_px of the ROI but not inside it."""
    if roi is None:
        return False
    if person_inside_roi(box_xyxy, roi):
        return False   # already inside → not just "near"
    margin = margin_px if margin_px is not None else _ROI_PROXIMITY_PX
    expanded = {
        "x": roi["x"] - margin,
        "y": roi["y"] - margin,
        "w": roi["w"] + margin * 2,
        "h": roi["h"] + margin * 2,
    }
    return person_inside_roi(box_xyxy, expanded)


def analyze_frame(frame, roi=None, include_roi=True, camera_id="front-door"):
    started_at = time.perf_counter()
    if roi is None and include_roi:
        roi = draw_roi(frame)

    height, width = frame.shape[:2]

    # Draw the counting line (horizontal, at LINE_Y_FRAC of frame height)
    line_y = int(height * LINE_Y_FRAC)
    cv2.line(frame, (0, line_y), (width, line_y), (255, 255, 0), 1)
    cv2.putText(frame, "Count Line", (8, line_y - 5),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 0), 1)

    with _model_lock:
        # Raised from 0.45 → 0.55: fewer false bounding boxes on background
        # objects. At 0.45 many partial/occluded views triggered detections;
        # 0.55 requires the model to be more confident before drawing a box.
        results = model(frame, imgsz=get_detection_imgsz(), conf=0.55, verbose=False)

    person_detected    = False
    confidence         = 0.0
    intrusion_detected = False
    near_zone_detected = False
    persons_raw        = []   # list of {"box":(x1,y1,x2,y2), "confidence": float}

    for result in results:
        for box in result.boxes:
            cls            = int(box.cls[0])
            box_confidence = float(box.conf[0])
            label          = model.names[cls]
            if label != "person":
                continue

            person_detected = True
            confidence      = max(confidence, box_confidence)
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            box_xyxy        = (x1, y1, x2, y2)
            persons_raw.append({"box": box_xyxy, "confidence": round(box_confidence, 2)})

            if include_roi and roi is not None:
                inside = person_inside_roi(box_xyxy, roi)
                near   = person_near_roi(box_xyxy, roi)

                if inside:
                    intrusion_detected = True
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
                    cv2.putText(frame, f"INTRUSION {box_confidence:.2f}",
                                (x1, max(y1 - 10, 20)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 255), 2)
                    cv2.putText(frame, "INTRUSION",
                                (x1, min(y2 + 18, height - 6)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
                elif near:
                    near_zone_detected = True
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 165, 255), 2)
                    cv2.putText(frame, f"NEAR ZONE {box_confidence:.2f}",
                                (x1, max(y1 - 10, 20)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 165, 255), 2)
                else:
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    cv2.putText(frame, f"person {box_confidence:.2f}",
                                (x1, max(y1 - 10, 20)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 0), 2)
            else:
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(frame, f"person {box_confidence:.2f}",
                            (x1, max(y1 - 10, 20)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 0), 2)

    # ── In/Out tracking ──────────────────────────────────────────────────────
    # Update the per-camera tracker with all detected bounding boxes.
    camera = _cameras.get(camera_id)
    tracker_result = {"count_in": 0, "count_out": 0, "person_count": len(persons_raw)}
    if camera is not None:
        tracker_result = camera["tracker"].update(
            [p["box"] for p in persons_raw], height
        )

    person_count = tracker_result["person_count"]

    # Draw person count overlay (top-right corner)
    if person_count > 0:
        count_text = f"Count: {person_count}"
        in_text    = f"IN:{tracker_result['count_in']}  OUT:{tracker_result['count_out']}"
        cv2.putText(frame, count_text, (width - 130, 24),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
        cv2.putText(frame, in_text, (width - 150, 46),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 0), 1)

    # ── Threat analysis (two-stage pipeline) ────────────────────────────────
    # WHY TWO-STAGE?
    # Running fire/fight/weapon detection on every frame is expensive (~400ms).
    # Stage 1 (person detection above, ~50ms) already tells us if anyone is
    # in frame. Fire/weapon/fight cannot happen without a person present, so
    # we skip the expensive Stage 2 entirely when the frame is empty.
    # Exception: fire detection via HSV is so cheap (~0.5ms) we always run it.
    #
    # Result: empty-room frames process in ~50ms instead of ~500ms.
    safety = detect_harmful_activity(frame, camera_id=camera_id,
                                     person_present=person_detected)

    harmful_activity_detected = bool(safety.get("harmful_activity_detected"))
    threat_level    = safety.get("threat_level",   "CLEAR")
    threat_category = safety.get("threat_category","clear")
    threat_label    = safety.get("threat_label",   "")
    alarm_type      = safety.get("alarm_type",      None)

    # Draw a clear threat label in the top-left when a CRITICAL/HIGH threat found
    if harmful_activity_detected and threat_label:
        label_text = f"{threat_label}  {safety.get('confidence', 0.0):.0%}"
        cv2.putText(frame, label_text, (10, 80),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.70, (0, 0, 255), 2)

    # Build human-readable message using structured threat data
    if safety.get("fire_detected"):
        message = f"🔥 FIRE detected — {safety.get('fire_confidence', 0.0):.0%} confidence"
    elif safety.get("weapon_detected"):
        message = f"🔫 WEAPON detected: {safety.get('weapon_label','unknown')}"
    elif safety.get("fight_detected"):
        message = f"⚔ FIGHT/VIOLENCE detected — {safety.get('fight_confidence', 0.0):.0%} confidence"
    elif intrusion_detected:
        message = f"🚨 Intrusion detected ({person_count} person{'s' if person_count != 1 else ''})"
    elif near_zone_detected:
        message = "⚠ Person near restricted zone"
    elif person_detected:
        message = f"Motion detected — {person_count} person{'s' if person_count != 1 else ''}"
    else:
        message = "No person detected"

    return {
        "person_detected":           person_detected,
        "person_count":              person_count,
        "persons":                   persons_raw,
        "count_in":                  tracker_result["count_in"],
        "count_out":                 tracker_result["count_out"],
        "label":                     "person" if person_detected else None,
        "confidence":                round(confidence, 2),
        "intrusion_detected":        intrusion_detected,
        "near_zone_detected":        near_zone_detected,
        # ── Threat fields (new, from threat_detector.py) ──
        "harmful_activity_detected": harmful_activity_detected,
        "threat_level":              threat_level,
        "threat_category":           threat_category,
        "threat_label":              threat_label,
        "alarm_type":                alarm_type,
        "fire_detected":             safety.get("fire_detected",     False),
        "fire_confidence":           safety.get("fire_confidence",   0.0),
        "fight_detected":            safety.get("fight_detected",    False),
        "fight_confidence":          safety.get("fight_confidence",  0.0),
        "weapon_detected":           safety.get("weapon_detected",   False),
        "weapon_label":              safety.get("weapon_label",      None),
        "weapon_confidence":         safety.get("weapon_confidence", 0.0),
        # ── Legacy safety fields (keep for backward compat) ──
        "safety_label":              safety.get("label"),
        "safety_confidence":         safety.get("confidence", 0.0),
        "safety_message":            safety.get("message"),
        "roi":                       roi,
        "message":                   message,
        "latency_ms":                round((time.perf_counter() - started_at) * 1000),
    }


def _create_unavailable_preview(camera_id="front-door"):
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.putText(frame, "Camera unavailable", (120, 240), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 2)
    cv2.putText(frame, f"Camera: {camera_id}", (160, 280), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)
    success, encoded = cv2.imencode(".jpg", frame)
    if not success:
        return None
    encoded_image = base64.b64encode(encoded).decode("utf-8")
    return {
        "camera_id": camera_id,
        "image": f"data:image/jpeg;base64,{encoded_image}",
        "person_detected": False,
        "label": None,
        "confidence": 0.0,
        "message": "Camera unavailable",
        "latency_ms": 0,
        "harmful_activity_detected": False,
        "safety_label": None,
        "safety_confidence": 0.0,
        "safety_message": "Camera unavailable",
    }


def get_camera_preview(camera_id="front-door"):
    camera = _get_camera(camera_id)
    if camera is None:
        return None

    with camera["preview_lock"]:
        if camera["latest_preview"] is not None and (time.monotonic() - camera["last_analysis"]) < ANALYSIS_COOLDOWN_SECONDS:
            return camera["latest_preview"].copy()

    frame = get_camera_frame(camera_id)
    if frame is None:
        return _create_unavailable_preview(camera_id)

    preview = _analyze_and_encode(camera, frame)
    if preview is None:
        return _create_unavailable_preview(camera_id)
    with camera["preview_lock"]:
        camera["latest_preview"] = preview
    return preview.copy()


def _analyze_and_encode(camera, frame):
    detection = analyze_frame(frame, camera_id=camera["id"])
    success, encoded = cv2.imencode(".jpg", frame)
    if not success:
        return None

    camera["last_detection"]  = detection["message"]
    camera["last_latency_ms"] = detection["latency_ms"]
    camera["last_analysis"]   = time.monotonic()
    encoded_image = base64.b64encode(encoded).decode("utf-8")
    return {
        "camera_id": camera["id"],
        "image": f"data:image/jpeg;base64,{encoded_image}",
        **detection,
    }


def _capture_loop():
    while CAMERA_DETECTION_ENABLED:
        for camera in _cameras.values():
            if camera["source"] is None:
                camera["online"] = False
                continue
            if (time.monotonic() - camera["last_analysis"]) < ANALYSIS_COOLDOWN_SECONDS:
                continue
            frame = get_camera_frame(camera["id"])
            if frame is None:
                continue

            preview = _analyze_and_encode(camera, frame)
            if preview is None:
                continue

            with camera["preview_lock"]:
                camera["latest_preview"] = preview
        time.sleep(0.2)


def start_detection_worker():
    global _worker_started
    with _worker_start_lock:
        if _worker_started:
            return
        worker = threading.Thread(target=_capture_loop, name="camera-inference", daemon=True)
        worker.start()
        _worker_started = True


def detect_person(camera_id="front-door"):
    preview = get_camera_preview(camera_id)
    if preview is None:
        return {
            "camera_id": camera_id,
            "person_detected": False,
            "label": None,
            "confidence": 0.0,
            "message": "Camera unavailable",
            "error": "Could not open camera",
        }

    return {key: value for key, value in preview.items() if key != "image"}


def run_live_detection():
    cap = open_camera()
    if cap is None:
        print("Could not open camera")
        return

    last_alert_time = 0.0
    intrusion_active = False

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Could not read camera frame")
            break

        roi = draw_roi(frame)
        detection = analyze_frame(frame, roi=roi, include_roi=True)
        now = time.monotonic()

        if detection["intrusion_detected"]:
            if not intrusion_active and (now - last_alert_time) >= ANALYSIS_COOLDOWN_SECONDS:
                last_alert_time = now
                intrusion_active = True
                cv2.putText(frame, "INTRUSION DETECTED", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        else:
            intrusion_active = False

        cv2.imshow("Home Security Detection", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    run_live_detection()
