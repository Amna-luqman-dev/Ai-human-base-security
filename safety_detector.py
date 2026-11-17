"""
safety_detector.py — Backward-compatible wrapper around threat_detector.py
===========================================================================
The rest of the codebase (app.py, camera_detector.py) imports two things
from this module:
  • safety_model_status()       — health/info endpoint
  • detect_harmful_activity()   — per-frame detection

Both functions are kept here for compatibility but now delegate to
threat_detector.py, which uses the more accurate yolo_small_weights.pt
model (21.5 MB, YOLOv8-small) instead of the old nano weights, and adds
fire + weapon detection on top of fighting.

WHY KEEP THIS FILE AT ALL?
Changing the import in camera_detector.py and app.py would require touching
more files and risks breaking something. The wrapper pattern lets us upgrade
the engine without changing the callers.
"""

from pathlib import Path
from threat_detector import (
    _load_fight_model,
    _FIGHT_MODEL_PATH,
    analyze_threats,
)

# ── Status (used by /health and /summary endpoints) ──────────────────────────
def safety_model_status() -> dict:
    """
    Returns the status of the threat detection system.
    Reports the fight model (yolo_small_weights.pt) as the primary safety model.
    """
    model = _load_fight_model()
    available = model is not None

    if available:
        names = list(getattr(model, "names", {}).values())
        # Add the extra threat categories we now handle
        extra = ["fire (HSV heuristic)", "knife (COCO)", "baseball_bat (COCO)", "scissors (COCO)"]
        return {
            "available":        True,
            "message":          "Threat detection active — fight/fire/weapon detection enabled.",
            "model_path":       str(_FIGHT_MODEL_PATH),
            "supported_labels": names + extra,
        }
    else:
        return {
            "available":        False,
            "message":          f"Fight model not found at {_FIGHT_MODEL_PATH}. Fire and weapon detection still active.",
            "model_path":       str(_FIGHT_MODEL_PATH),
            "supported_labels": ["fire (HSV)", "knife (COCO)", "baseball_bat (COCO)", "scissors (COCO)"],
        }


# ── Per-frame detection (called by analyze_frame in camera_detector.py) ───────
def detect_harmful_activity(frame, camera_id: str = "front-door", person_present: bool = True) -> dict:
    """
    Runs the full threat analysis (fire + fight + weapon) and returns a dict
    that is backward-compatible with what camera_detector.py and app.py expect.

    person_present: if False, skip fight and weapon detection (two-stage pipeline).
                    Fire detection always runs — fire doesn't need a person.
    """
    result = analyze_threats(frame, camera_id=camera_id, person_present=person_present)

    return {
        # ── Legacy fields (backward compatible) ──
        "harmful_activity_detected": result["threat_detected"],
        "confidence":                result["confidence"],
        "label":                     result["threat_category"] if result["threat_detected"] else None,
        "message": (
            f"{result['threat_label']} detected"
            if result["threat_detected"]
            else "No harmful activity detected"
        ),
        # ── New enriched fields ──
        "threat_category":   result["threat_category"],
        "threat_level":      result["threat_level"],
        "threat_label":      result["threat_label"],
        "alarm_type":        result["alarm_type"],
        "fire_detected":     result["fire_detected"],
        "fire_confidence":   result["fire_confidence"],
        "fight_detected":    result["fight_detected"],
        "fight_confidence":  result["fight_confidence"],
        "weapon_detected":   result["weapon_detected"],
        "weapon_label":      result["weapon_label"],
        "weapon_confidence": result["weapon_confidence"],
    }
