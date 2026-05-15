/**
 * Persistence pipeline.
 *
 * The legacy code called persistState(state) from 71 sites, each one
 * a synchronous JSON.stringify of the entire app state into
 * localStorage. Heavy chats therefore re-serialised on every keystroke.
 *
 * createPersistencePipeline wraps an underlying saveState(state)
 * implementation in:
 *   - an idle-callback debouncer (createIdleDebouncer) so callers can
 *     schedule freely; only one write actually fires per idle frame.
 *   - a flush() that drains the queue immediately (used by
 *     pagehide / beforeunload / visibilitychange).
 *   - bindLifecycleFlush(window) which wires those three lifecycle
 *     events to flush(state) so nothing is ever lost on close /
 *     background.
 */

import { createIdleDebouncer } from "../../utils/scheduler.js";

export function createPersistencePipeline(saveState, { timeout = 400 } = {}) {
  if (typeof saveState !== "function") {
    throw new TypeError("createPersistencePipeline requires a saveState function");
  }

  const debouncer = createIdleDebouncer(
    (s) => { try { saveState(s); } catch (_) { /* quota errors silenced */ } },
    { timeout }
  );

  const persistDebounced = (state) => debouncer.schedule(state);
  const persistImmediate = (state) => {
    debouncer.cancel();
    try { saveState(state); } catch (_) { /* quota errors silenced */ }
  };

  function bindLifecycleFlush(scope, getState) {
    if (!scope || typeof scope.addEventListener !== "function") return () => {};
    if (typeof getState !== "function") {
      throw new TypeError("bindLifecycleFlush requires a getState() function");
    }
    const onUnload = () => { try { persistImmediate(getState()); } catch (_) {} };
    const onVis = () => {
      const doc = scope.document;
      if (doc && doc.visibilityState === "hidden") onUnload();
    };
    scope.addEventListener("pagehide", onUnload);
    scope.addEventListener("beforeunload", onUnload);
    if (scope.document?.addEventListener) {
      scope.document.addEventListener("visibilitychange", onVis);
    }
    return () => {
      scope.removeEventListener("pagehide", onUnload);
      scope.removeEventListener("beforeunload", onUnload);
      scope.document?.removeEventListener?.("visibilitychange", onVis);
    };
  }

  return {
    persist: persistDebounced,
    persistImmediate,
    flush: persistImmediate,
    bindLifecycleFlush,
    get pending() { return debouncer.pending; },
  };
}
