/* =========================================================================
   roi.js — Per-camera ROI storage
   =========================================================================
   WHY LOCALSTORAGE?
   The backend has one global ROI in .env that requires a restart to change.
   We want per-camera zones that update instantly without touching the server.
   localStorage is the right tool: it persists across page reloads, it's
   synchronous (no async needed for reading), and it's scoped to this origin.

   STORAGE KEY FORMAT:  "roi_<camera-id>"
   STORED VALUE:  JSON string of { x, y, w, h, prox }
     x, y, w, h — fractions of the frame (0.0 – 1.0)
     prox       — proximity warning margin in pixels (integer)

   HOW THE ROI IS USED:
   The backend draws its own global ROI on the frame (cyan box in the JPEG).
   The per-camera ROI we store here is drawn CLIENT-SIDE as a canvas overlay
   on top of the camera image — an additional zone per camera that the user
   controls from the browser, no backend restart needed.

   This gives you TWO layers of zones:
     1. Backend global zone (from .env) — drawn in the JPEG itself
     2. Per-camera frontend zones (from localStorage) — drawn by the browser

   USAGE:
     import { roiStore } from './roi.js';
     const roi = roiStore.get('front-door');   // always returns a valid object
     roiStore.set('front-door', { x:0.1, y:0.1, w:0.4, h:0.3, prox:20 });
     roiStore.reset('front-door');             // back to defaults
     roiStore.getAll();                        // { 'front-door': {...}, ... }
   ========================================================================= */

// Default ROI — matches the current .env values so the frontend zone aligns
// with the backend zone by default. User can move it independently.
const DEFAULTS = { x: 0.05, y: 0.06, w: 0.17, h: 0.22, prox: 15 };

const STORAGE_PREFIX = "roi_";

export const roiStore = {

  /* Get the ROI for a camera. Always returns a complete valid object.
     If nothing is saved yet, returns the defaults.                        */
  get(cameraId) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + cameraId);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw);
      // Merge with defaults so missing keys don't cause crashes
      return { ...DEFAULTS, ...parsed };
    } catch {
      return { ...DEFAULTS };
    }
  },

  /* Save a ROI for a camera.
     Validates and clamps values so nothing out-of-range gets stored.     */
  set(cameraId, roi) {
    const safe = {
      x:    Math.min(0.95, Math.max(0, Number(roi.x)    || DEFAULTS.x)),
      y:    Math.min(0.95, Math.max(0, Number(roi.y)    || DEFAULTS.y)),
      w:    Math.min(1.0,  Math.max(0.01, Number(roi.w) || DEFAULTS.w)),
      h:    Math.min(1.0,  Math.max(0.01, Number(roi.h) || DEFAULTS.h)),
      prox: Math.min(200,  Math.max(0, Math.round(Number(roi.prox) || DEFAULTS.prox))),
    };
    localStorage.setItem(STORAGE_PREFIX + cameraId, JSON.stringify(safe));
    return safe;
  },

  /* Reset a camera's ROI back to defaults.                               */
  reset(cameraId) {
    localStorage.removeItem(STORAGE_PREFIX + cameraId);
    return { ...DEFAULTS };
  },

  /* Reset ALL cameras (used for "reset all" button).                     */
  resetAll() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(STORAGE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  },

  /* Get ROIs for all cameras that have been saved.                       */
  getAll() {
    const result = {};
    Object.keys(localStorage)
      .filter((k) => k.startsWith(STORAGE_PREFIX))
      .forEach((k) => {
        const id = k.slice(STORAGE_PREFIX.length);
        result[id] = this.get(id);
      });
    return result;
  },

  /* Check if a camera has a custom (non-default) ROI saved.             */
  hasCustom(cameraId) {
    return localStorage.getItem(STORAGE_PREFIX + cameraId) !== null;
  },
};

/* =========================================================================
   Canvas drawing utility — used by both cameras.js and settings.js
   =========================================================================
   Call drawROIOverlay(canvas, roi) to render the zone onto any canvas.
   The canvas should be positioned absolute over the camera image.
   ========================================================================= */
export function drawROIOverlay(canvas, roi, opts = {}) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  // Clear previous frame
  ctx.clearRect(0, 0, W, H);

  if (!roi) return;

  const { x, y, w, h, prox } = roi;
  const rx = x * W;
  const ry = y * H;
  const rw = w * W;
  const rh = h * H;

  // ── Proximity zone (orange dashed) ──────────────────────────────────
  // Shows the warning area — person within this ring but outside the zone
  // triggers a "Near Zone" warning instead of a full intrusion.
  const px = prox * (W / 640);   // scale prox pixels to canvas size
  const py = prox * (H / 480);
  ctx.save();
  ctx.strokeStyle = "rgba(245, 158, 11, 0.6)";
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(rx - px, ry - py, rw + px * 2, rh + py * 2);
  ctx.setLineDash([]);
  ctx.restore();

  // ── ROI fill (subtle cyan tint) ──────────────────────────────────────
  ctx.fillStyle = "rgba(0, 255, 255, 0.08)";
  ctx.fillRect(rx, ry, rw, rh);

  // ── ROI border (cyan, 2 px) ──────────────────────────────────────────
  ctx.strokeStyle = opts.color || "rgba(0, 255, 255, 0.95)";
  ctx.lineWidth   = 2;
  ctx.strokeRect(rx, ry, rw, rh);

  // ── Corner handles (shows this is draggable / editable) ─────────────
  const hs = 7; // handle size
  ctx.fillStyle = opts.color || "rgba(0, 255, 255, 0.95)";
  [
    [rx,       ry      ],   // top-left
    [rx + rw,  ry      ],   // top-right
    [rx,       ry + rh ],   // bottom-left
    [rx + rw,  ry + rh ],   // bottom-right
  ].forEach(([cx, cy]) => {
    ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
  });

  // ── Label ────────────────────────────────────────────────────────────
  const label = opts.label || "Restricted Zone";
  ctx.font      = `bold ${Math.max(10, W * 0.032)}px 'Segoe UI', sans-serif`;
  ctx.fillStyle = opts.color || "rgba(0, 255, 255, 0.95)";

  // Background pill behind the label so it's readable over any image
  const textW = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(rx + 4, ry + 4, textW + 10, Math.max(14, W * 0.038));
  ctx.fillStyle = opts.color || "rgba(0, 255, 255, 0.95)";
  ctx.fillText(label, rx + 9, ry + Math.max(14, W * 0.034));

  // ── Dimension hint ───────────────────────────────────────────────────
  if (opts.showDimensions !== false) {
    const dimText = `${Math.round(x * 100)}%,${Math.round(y * 100)}%  ${Math.round(w * 100)}×${Math.round(h * 100)}%`;
    ctx.font      = `${Math.max(9, W * 0.026)}px 'Segoe UI', sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText(dimText, rx + 4, ry + rh - 5);
  }
}
