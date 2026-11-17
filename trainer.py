"""
trainer.py — User-feedback model fine-tuning
==============================================
HOW YOLOV8 FINE-TUNING WORKS:
  YOLOv8 (Ultralytics) can be fine-tuned on new data with model.train().
  It expects data in the YOLO format:
    dataset/
      images/train/  ← JPEG frames
      images/val/    ← validation subset (we use 20% of feedback)
      labels/train/  ← .txt files, one line per object:
                       <class_id> <cx> <cy> <w> <h>   (all 0-1 fractions)
      labels/val/
      data.yaml      ← class names + path config

  For our system:
    class 0 = person  (correct detection — user confirmed ✔)

  "False alarm" frames (user marked ✗) are saved as EMPTY label files,
  meaning "no person here". This teaches the model to stop firing on those
  kinds of scenes.

  After training, the fine-tuned weights are saved to:
    feedback_data/runs/train/weights/best.pt

  The system does NOT automatically swap to the new weights — the user
  explicitly clicks "Apply New Weights" to load them. This is intentional:
  the operator should verify the new model before deploying it.

THREAD SAFETY:
  Training runs in a daemon thread. A _TrainingState dataclass tracks
  status, progress, and any error message. All reads/writes go through
  a threading.Lock so the API can safely poll status while training runs.
"""

import base64
import json
import math
import os
import shutil
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml
from ultralytics import YOLO

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR      = Path(__file__).resolve().parent
FEEDBACK_DIR  = BASE_DIR / "feedback_data"
IMAGES_DIR    = FEEDBACK_DIR / "images"
LABELS_DIR    = FEEDBACK_DIR / "labels"
RUNS_DIR      = FEEDBACK_DIR / "runs"
DATA_YAML     = FEEDBACK_DIR / "data.yaml"
META_FILE     = FEEDBACK_DIR / "meta.json"   # tracks sample counts

# Ensure all directories exist on import
for d in [IMAGES_DIR, LABELS_DIR, RUNS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# ── Training state ────────────────────────────────────────────────────────────
@dataclass
class _TrainingState:
    running:    bool          = False
    progress:   int           = 0       # 0-100
    epoch:      int           = 0
    total_epochs: int         = 0
    status:     str           = "idle"  # idle | running | done | error
    message:    str           = ""
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    best_weights: Optional[str] = None  # path to best.pt after training
    error:      Optional[str] = None

_state      = _TrainingState()
_state_lock = threading.Lock()


def get_training_status() -> dict:
    with _state_lock:
        elapsed = None
        if _state.started_at:
            end = _state.finished_at or time.time()
            elapsed = round(end - _state.started_at)
        return {
            "running":       _state.running,
            "progress":      _state.progress,
            "epoch":         _state.epoch,
            "total_epochs":  _state.total_epochs,
            "status":        _state.status,
            "message":       _state.message,
            "elapsed_s":     elapsed,
            "best_weights":  _state.best_weights,
            "error":         _state.error,
        }


# ── Feedback metadata ─────────────────────────────────────────────────────────
def _load_meta() -> dict:
    if META_FILE.exists():
        try:
            return json.loads(META_FILE.read_text())
        except Exception:
            pass
    return {"total": 0, "correct": 0, "false_alarm": 0, "samples": []}


def _save_meta(meta: dict):
    META_FILE.write_text(json.dumps(meta, indent=2))


def get_feedback_stats() -> dict:
    meta = _load_meta()
    return {
        "total":        meta.get("total", 0),
        "correct":      meta.get("correct", 0),
        "false_alarm":  meta.get("false_alarm", 0),
        "min_for_train": 10,   # minimum samples before training is allowed
        "can_train":    meta.get("total", 0) >= 10,
        "recent":       meta.get("samples", [])[-20:],  # last 20 for UI
    }


# ── Save one feedback sample ──────────────────────────────────────────────────
def save_feedback(
    image_b64: str,
    label: str,           # "correct" | "false_alarm"
    camera_id: str,
    persons: list,        # list of {"box": [x1,y1,x2,y2], "confidence": float}
    frame_w: int = 640,
    frame_h: int = 480,
) -> dict:
    """
    Save a feedback sample to disk.

    image_b64 : base64-encoded JPEG (the data:image/jpeg;base64,... prefix is stripped)
    label     : "correct" means persons shown are real; "false_alarm" means none should be detected
    persons   : bounding boxes from the API response — used to generate YOLO label files
    """
    meta   = _load_meta()
    sample_id = int(time.time() * 1000)   # ms timestamp as unique ID

    # Strip data URI prefix if present
    if "," in image_b64:
        image_b64 = image_b64.split(",", 1)[1]

    # Save JPEG
    img_path = IMAGES_DIR / f"{sample_id}.jpg"
    try:
        img_path.write_bytes(base64.b64decode(image_b64))
    except Exception as e:
        return {"saved": False, "error": str(e)}

    # Save YOLO label file
    lbl_path = LABELS_DIR / f"{sample_id}.txt"
    if label == "false_alarm" or not persons:
        # Empty label = background / no object → teaches the model to stop misfiring
        lbl_path.write_text("")
    else:
        lines = []
        for p in persons:
            box = p.get("box", [])
            if len(box) != 4:
                continue
            x1, y1, x2, y2 = box
            # Convert pixel box to YOLO fraction format (cx, cy, w, h)
            cx = ((x1 + x2) / 2) / frame_w
            cy = ((y1 + y2) / 2) / frame_h
            bw = (x2 - x1) / frame_w
            bh = (y2 - y1) / frame_h
            # class 0 = person
            lines.append(f"0 {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}")
        lbl_path.write_text("\n".join(lines))

    # Update metadata
    meta["total"]        = meta.get("total", 0) + 1
    meta[label]          = meta.get(label, 0) + 1
    samples              = meta.get("samples", [])
    samples.append({
        "id":        sample_id,
        "label":     label,
        "camera_id": camera_id,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "person_count": len(persons),
    })
    meta["samples"] = samples
    _save_meta(meta)

    return {"saved": True, "sample_id": sample_id, "label": label, "total": meta["total"]}


# ── Build YOLO dataset split ──────────────────────────────────────────────────
def _build_dataset(val_split: float = 0.2) -> Path:
    """
    Organise feedback samples into train/val splits and write data.yaml.
    Returns the path to data.yaml.
    """
    all_imgs = sorted(IMAGES_DIR.glob("*.jpg"))
    if not all_imgs:
        raise ValueError("No feedback images found.")

    n_val   = max(1, math.floor(len(all_imgs) * val_split))
    n_train = len(all_imgs) - n_val

    train_imgs = all_imgs[:n_train]
    val_imgs   = all_imgs[n_train:]

    # Create split directories
    for split, imgs in [("train", train_imgs), ("val", val_imgs)]:
        img_dir = FEEDBACK_DIR / "dataset" / "images" / split
        lbl_dir = FEEDBACK_DIR / "dataset" / "labels" / split
        img_dir.mkdir(parents=True, exist_ok=True)
        lbl_dir.mkdir(parents=True, exist_ok=True)

        for img_path in imgs:
            shutil.copy2(img_path, img_dir / img_path.name)
            lbl_path = LABELS_DIR / (img_path.stem + ".txt")
            if lbl_path.exists():
                shutil.copy2(lbl_path, lbl_dir / lbl_path.name)
            else:
                (lbl_dir / (img_path.stem + ".txt")).write_text("")

    # Write data.yaml (required by Ultralytics trainer)
    data_cfg = {
        "path":  str(FEEDBACK_DIR / "dataset"),
        "train": "images/train",
        "val":   "images/val",
        "nc":    1,
        "names": {0: "person"},
    }
    DATA_YAML.write_text(yaml.dump(data_cfg))
    return DATA_YAML


# ── Training thread ───────────────────────────────────────────────────────────
class _ProgressCallback:
    """Ultralytics trainer callback that updates _state after each epoch."""
    def __init__(self, total_epochs: int):
        self._total = total_epochs

    def on_train_epoch_end(self, trainer):
        epoch = trainer.epoch + 1
        with _state_lock:
            _state.epoch    = epoch
            _state.progress = round(epoch / self._total * 100)
            _state.message  = f"Epoch {epoch}/{self._total}"


def _run_training(epochs: int, base_weights: str):
    """Runs in a background daemon thread."""
    with _state_lock:
        _state.running      = True
        _state.progress     = 0
        _state.epoch        = 0
        _state.total_epochs = epochs
        _state.status       = "running"
        _state.message      = "Preparing dataset…"
        _state.started_at   = time.time()
        _state.finished_at  = None
        _state.best_weights = None
        _state.error        = None

    try:
        # Build train/val split
        data_yaml = _build_dataset()

        with _state_lock:
            _state.message = "Loading base weights…"

        m = YOLO(base_weights)

        cb = _ProgressCallback(epochs)
        m.add_callback("on_train_epoch_end", cb.on_train_epoch_end)

        with _state_lock:
            _state.message = f"Training for {epochs} epochs…"

        results = m.train(
            data      = str(data_yaml),
            epochs    = epochs,
            imgsz     = 320,          # match our inference size
            batch     = 8,
            project   = str(RUNS_DIR),
            name      = "finetune",
            exist_ok  = True,
            verbose   = False,
            device    = "cpu",        # safe default; GPU used automatically if available
        )

        best = Path(results.save_dir) / "weights" / "best.pt"
        with _state_lock:
            _state.running      = False
            _state.progress     = 100
            _state.status       = "done"
            _state.message      = "Training complete"
            _state.finished_at  = time.time()
            _state.best_weights = str(best) if best.exists() else None

    except Exception as exc:
        with _state_lock:
            _state.running     = False
            _state.status      = "error"
            _state.message     = "Training failed"
            _state.error       = str(exc)
            _state.finished_at = time.time()


def start_training(epochs: int = 20, base_weights: str = "yolov8n.pt") -> dict:
    """
    Kick off fine-tuning in a background thread.
    Returns immediately with the current status.
    """
    with _state_lock:
        if _state.running:
            return {"started": False, "reason": "Training already in progress"}

    stats = get_feedback_stats()
    if not stats["can_train"]:
        return {
            "started": False,
            "reason":  f"Need at least {stats['min_for_train']} feedback samples. "
                       f"Currently have {stats['total']}.",
        }

    t = threading.Thread(
        target=_run_training,
        args=(epochs, base_weights),
        name="feedback-trainer",
        daemon=True,
    )
    t.start()
    return {"started": True, "epochs": epochs, "base_weights": base_weights}
