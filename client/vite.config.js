import { defineConfig } from "vite";

// ---------------------------------------------------------------------------
// Vite config – dev-server proxy
//
// In development the frontend runs on http://localhost:5173 and the FastAPI
// backend on http://127.0.0.1:8000.  Without a proxy the browser would block
// cross-origin requests (CORS).  By forwarding API paths here, the browser
// believes every request stays on localhost:5173, and Vite quietly relays them
// to the backend.  This mirrors how a reverse proxy (nginx, etc.) would work
// in production.
// ---------------------------------------------------------------------------
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      // Every key is a path *prefix* that Vite should forward to the backend.
      "/health":        "http://127.0.0.1:8000",
      "/status":        "http://127.0.0.1:8000",
      "/summary":       "http://127.0.0.1:8000",
      "/events":        "http://127.0.0.1:8000",
      "/camera":        "http://127.0.0.1:8000",   // matches /camera/* AND /cameras/*
      "/security":      "http://127.0.0.1:8000",
      "/safety-alerts": "http://127.0.0.1:8000",
      "/settings":      "http://127.0.0.1:8000",
      "/api":           "http://127.0.0.1:8000",
    },
  },
});
