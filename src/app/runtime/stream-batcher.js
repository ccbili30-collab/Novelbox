/**
 * Stream-DOM batcher.
 *
 * AI streaming responses arrive token-by-token; without batching the
 * DOM would update on every chunk and visibly thrash. The legacy code
 * used a Map<key, timerId> to coalesce updates per node into one
 * scheduled callback.
 *
 * createStreamBatcher() returns a small API:
 *   - schedule(key, callback, delay = 120):
 *       Run `callback` after `delay` ms. If a callback is already
 *       queued under the same key it's left alone (first-in wins,
 *       like the legacy version) so a slow render loop can't
 *       starve the UI by stacking.
 *   - cancel(key?):
 *       Cancel one queued callback (or all if no key given).
 *   - pendingKeys(): inspection helper for tests + diagnostics.
 *
 * Pure: no DOM, no module globals.
 */

export function createStreamBatcher({
  setTimeout: schedule = (typeof globalThis.setTimeout === "function" ? globalThis.setTimeout.bind(globalThis) : null),
  clearTimeout: cancel = (typeof globalThis.clearTimeout === "function" ? globalThis.clearTimeout.bind(globalThis) : null),
} = {}) {
  if (typeof schedule !== "function" || typeof cancel !== "function") {
    throw new TypeError("createStreamBatcher needs setTimeout/clearTimeout (default to globals).");
  }
  const timers = new Map();

  function scheduleUpdate(key, callback, delay = 120) {
    if (timers.has(key)) return;
    const timer = schedule(() => {
      timers.delete(key);
      try { callback(); } catch (_) { /* swallow renderer errors */ }
    }, delay);
    timers.set(key, timer);
  }

  function cancelUpdate(key = null) {
    const keys = key == null ? Array.from(timers.keys()) : [key];
    for (const k of keys) {
      const timer = timers.get(k);
      if (timer != null) cancel(timer);
      timers.delete(k);
    }
  }

  return {
    schedule: scheduleUpdate,
    cancel: cancelUpdate,
    pendingKeys: () => Array.from(timers.keys()),
  };
}
