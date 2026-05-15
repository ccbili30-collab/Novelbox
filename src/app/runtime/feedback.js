/**
 * Tactile / visual feedback helpers extracted from main.js.
 *
 * - createToast(els, snackbarApi): legacy showToast that prefers the
 *   MD3 snackbar but falls back to the in-DOM #toast banner if the
 *   custom element host isn't ready yet.
 * - prefersReducedMotion(): media-query helper.
 * - vibrateLight(command): haptic tap (only when motion is allowed).
 * - createPulse(MOTION_PULSE_MS) / createRipple(MOTION_RIPPLE_MS):
 *   factory functions that bake in the tunable durations from
 *   constants.js so the helpers never reach for module globals.
 *
 * Each helper degrades gracefully when its host environment is
 * missing (no document, no navigator.vibrate, no #toast element).
 */

export function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

export function vibrateLight(command = "") {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  if (prefersReducedMotion()) return;
  const heavier = /delete|stop|close|reset|undo/.test(command);
  try { navigator.vibrate(heavier ? 16 : 8); } catch { /* ignore */ }
}

export function createPulse(durationMs) {
  return function pulseElement(element) {
    if (!element || prefersReducedMotion()) return;
    element.classList.remove("motion-press");
    void element.offsetWidth;
    element.classList.add("motion-press");
    window.setTimeout(() => element.classList.remove("motion-press"), durationMs);
  };
}

export function createRipple(durationMs) {
  return function addMotionRipple(element, event) {
    if (!element || !event || prefersReducedMotion()) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ripple = document.createElement("span");
    const size = Math.max(rect.width, rect.height) * 1.45;
    ripple.className = "motion-ripple";
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    element.appendChild(ripple);
    window.setTimeout(() => ripple.remove(), durationMs);
  };
}

/**
 * Returns a showToast(message) that:
 *   1. Prefers the MD3 snackbar (snackbarApi.show) for queue + a11y.
 *   2. Falls back to the legacy #toast DOM banner if snackbar throws.
 *   3. Is a no-op when message is null/undefined.
 *
 * The factory captures `els` and the snackbar callable so call sites
 * never have to reach for module globals.
 */
export function createToast(els, snackbarShow) {
  let toastTimer = 0;
  let toastMotionTimer = 0;
  return function showToast(message) {
    if (message == null) return;
    try { snackbarShow(String(message), { short: true }); return; }
    catch (_) { /* fall through */ }
    if (!els || !els.toast) return;
    if (typeof window === "undefined") return;     // SSR / test env
    window.clearTimeout(toastTimer);
    window.clearTimeout(toastMotionTimer);
    els.toast.textContent = message;
    els.toast.hidden = false;
    els.toast.classList.remove("toast-pop");
    void els.toast.offsetWidth;
    els.toast.classList.add("toast-pop");
    toastMotionTimer = window.setTimeout(() => {
      els.toast.classList.remove("toast-pop");
    }, 420);
    toastTimer = window.setTimeout(() => {
      els.toast.hidden = true;
    }, 1800);
  };
}
