/**
 * MD3 snackbar with FIFO queue and auto-dismiss.
 *
 * Usage:
 *   import { showSnackbar } from "./snackbar.js";
 *   showSnackbar("Saved");
 *   showSnackbar("Failed to send", { variant: "error", action: { label: "Retry", onClick: retry } });
 *
 * One <mb-snackbar-host> is mounted lazily per document. Snackbars
 * render one at a time per MD3 spec; the next item from the queue
 * appears after the active one auto-dismisses or is closed.
 */

const DEFAULT_DURATION = 5000;
const SHORT_DURATION = 3000;

class SnackbarHost extends HTMLElement {
  constructor() {
    super();
    this._queue = [];
    this._active = null;
    this._timer = 0;
    this._el = null;
  }

  connectedCallback() {
    if (this._el) return;
    this._el = document.createElement("div");
    this._el.className = "md-snackbar";
    this._el.setAttribute("role", "status");
    this._el.setAttribute("aria-live", "polite");
    this._el.setAttribute("aria-atomic", "true");
    this._el.hidden = true;
    document.body.appendChild(this._el);
  }

  enqueue(item) {
    this._queue.push(item);
    if (!this._active) this._dequeue();
  }

  _dequeue() {
    const next = this._queue.shift();
    if (!next) {
      this._active = null;
      this._hide();
      return;
    }
    this._active = next;
    this._render(next);
  }

  _render(item) {
    const { message, action, variant, duration, dismissible } = item;
    this._el.textContent = "";
    if (variant === "error") {
      this._el.style.background = "var(--md-sys-color-error-container)";
      this._el.style.color = "var(--md-sys-color-on-error-container)";
    } else {
      this._el.style.background = "";
      this._el.style.color = "";
    }
    const text = document.createElement("span");
    text.className = "md-snackbar__text";
    text.style.flex = "1";
    text.textContent = message;
    this._el.appendChild(text);

    if (action && action.label) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "md-snackbar__action";
      btn.textContent = action.label;
      btn.addEventListener("click", () => {
        try { action.onClick?.(); } catch (e) { /* ignore */ }
        this._dismiss();
      });
      this._el.appendChild(btn);
    }
    if (dismissible !== false) {
      const close = document.createElement("button");
      close.type = "button";
      close.className = "md-snackbar__close";
      close.setAttribute("aria-label", "关闭提示");
      close.textContent = "×";
      close.addEventListener("click", () => this._dismiss());
      this._el.appendChild(close);
    }

    this._el.hidden = false;
    requestAnimationFrame(() => this._el.classList.add("is-open"));

    const ms = typeof duration === "number" ? duration : DEFAULT_DURATION;
    if (ms > 0) {
      this._timer = window.setTimeout(() => this._dismiss(), ms);
    }
  }

  _dismiss() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = 0;
    }
    this._el.classList.remove("is-open");
    window.setTimeout(() => this._dequeue(), 220);
  }

  _hide() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = 0;
    }
    this._el.classList.remove("is-open");
    this._el.hidden = true;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("mb-snackbar-host")) {
  customElements.define("mb-snackbar-host", SnackbarHost);
}

let _hostPromise = null;
function getHost() {
  if (_hostPromise) return _hostPromise;
  _hostPromise = new Promise((resolve) => {
    const mount = () => {
      let host = document.querySelector("mb-snackbar-host");
      if (!host) {
        host = document.createElement("mb-snackbar-host");
        document.body.appendChild(host);
      }
      resolve(host);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mount, { once: true });
    } else {
      mount();
    }
  });
  return _hostPromise;
}

export function showSnackbar(message, options = {}) {
  if (!message) return;
  const item = {
    message: String(message),
    action: options.action || null,
    variant: options.variant || "default",
    duration:
      typeof options.duration === "number"
        ? options.duration
        : options.short
        ? SHORT_DURATION
        : DEFAULT_DURATION,
    dismissible: options.dismissible !== false,
  };
  getHost().then((host) => host.enqueue(item));
}

export function showError(message, options = {}) {
  return showSnackbar(message, { ...options, variant: "error" });
}
