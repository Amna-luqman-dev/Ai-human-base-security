/* =========================================================================
   router.js — lightweight hash-based SPA router
   =========================================================================
   WHY A ROUTER?
   Right now everything lives on one page. As we add Camera, Alerts, Network
   and Settings pages we need a way to swap the visible content without a
   full page reload (which would restart all our polling intervals and lose
   state).

   HOW HASH ROUTING WORKS:
   The URL looks like  http://localhost:5174/#/cameras
   The part after #  is the "hash". The browser never sends it to the server,
   so the server always serves the same index.html. We read window.location.hash
   in JS and decide which page to show. No server config needed.

   USAGE:
     import { router } from './router.js';
     router.register('/cameras', CamerasPage);
     router.init(document.getElementById('page-outlet'));
     router.navigate('/cameras');
   ========================================================================= */

export class Router {
  constructor() {
    this._routes   = {};   // path → { mount, unmount }
    this._current  = null; // currently active page instance
    this._outlet   = null; // DOM element where pages are rendered
    this._navLinks = [];   // <a> elements to keep active state in sync
  }

  /* Register a page.
     page must be an object with:
       mount(container)  — renders HTML into container, starts page pollers
       unmount()         — stops pollers, cleans up listeners               */
  register(path, page) {
    this._routes[path] = page;
    return this;
  }

  /* Call once with the container element where pages should render.
     Listens to hashchange so back/forward buttons work automatically.     */
  init(outlet) {
    this._outlet = outlet;

    // Handle back/forward navigation
    window.addEventListener("hashchange", () => this._resolve());

    // Handle first load
    this._resolve();
    return this;
  }

  /* Navigate programmatically — e.g. router.navigate('/alerts')           */
  navigate(path) {
    window.location.hash = path;
  }

  /* Internal: read the hash, find the matching route, swap the page.      */
  _resolve() {
    // Strip the leading # — "  #/cameras" → "/cameras"
    const hash = window.location.hash.replace(/^#/, "") || "/";
    const path = hash.split("?")[0]; // ignore query params for now

    const page = this._routes[path] || this._routes["/"];
    if (!page) return;

    // Unmount the current page before mounting the next one.
    // This is important — it stops the old page's setInterval calls so we
    // don't pile up polling loops every time the user navigates.
    if (this._current && this._current.unmount) {
      this._current.unmount();
    }

    // Clear the outlet and give the new page a clean container
    this._outlet.innerHTML = "";
    this._current = page;
    page.mount(this._outlet);

    // Keep sidebar nav links in sync (active class)
    this._updateNav(path);
  }

  /* Add nav <a> elements so the router can toggle their active class.     */
  registerNavLinks(links) {
    this._navLinks = Array.from(links);
  }

  _updateNav(activePath) {
    this._navLinks.forEach((a) => {
      const linkPath = a.getAttribute("href").replace(/^#/, "");
      a.classList.toggle("nav__link--active", linkPath === activePath);
    });
  }
}

// Singleton — import this everywhere instead of creating multiple instances
export const router = new Router();
