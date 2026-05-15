/**
 * Frame and idle schedulers used to coalesce expensive UI work.
 *
 * The legacy code calls `render()` and `persistState()` synchronously
 * from dozens of event handlers. Heavy chats with hundreds of messages
 * therefore re-layout and re-serialise on every keystroke.
 *
 * `createFrameScheduler` collapses N synchronous schedule() calls in
 * the same task into a single rAF tick. `createIdleDebouncer` collapses
 * persist calls into a single trailing write that prefers
 * `requestIdleCallback`, with a setTimeout fallback for browsers that
 * lack it (Safari).
 */

const rAF =
  typeof globalThis.requestAnimationFrame === "function"
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : (cb) => setTimeout(() => cb(performance.now()), 16);

const cAF =
  typeof globalThis.cancelAnimationFrame === "function"
    ? globalThis.cancelAnimationFrame.bind(globalThis)
    : (id) => clearTimeout(id);

const rIC =
  typeof globalThis.requestIdleCallback === "function"
    ? globalThis.requestIdleCallback.bind(globalThis)
    : (cb, opts) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), opts?.timeout ?? 1);

const cIC =
  typeof globalThis.cancelIdleCallback === "function"
    ? globalThis.cancelIdleCallback.bind(globalThis)
    : (id) => clearTimeout(id);

export function createFrameScheduler(work) {
  if (typeof work !== "function") {
    throw new TypeError("createFrameScheduler requires a function");
  }
  let handle = 0;
  let pendingMeta = null;
  function runner() {
    handle = 0;
    const meta = pendingMeta;
    pendingMeta = null;
    work(meta);
  }
  return {
    schedule(meta) {
      if (meta != null) pendingMeta = meta;
      if (handle) return;
      handle = rAF(runner);
    },
    flush() {
      if (!handle) return;
      cAF(handle);
      handle = 0;
      const meta = pendingMeta;
      pendingMeta = null;
      work(meta);
    },
    cancel() {
      if (!handle) return;
      cAF(handle);
      handle = 0;
      pendingMeta = null;
    },
    get pending() {
      return Boolean(handle);
    },
  };
}

export function createIdleDebouncer(work, { timeout = 250 } = {}) {
  if (typeof work !== "function") {
    throw new TypeError("createIdleDebouncer requires a function");
  }
  let handle = 0;
  let lastArgs = null;
  function runner() {
    handle = 0;
    const args = lastArgs;
    lastArgs = null;
    if (args) work(...args);
  }
  return {
    schedule(...args) {
      lastArgs = args;
      if (handle) return;
      handle = rIC(runner, { timeout });
    },
    flush() {
      if (!handle) return;
      cIC(handle);
      handle = 0;
      const args = lastArgs;
      lastArgs = null;
      if (args) work(...args);
    },
    cancel() {
      if (!handle) return;
      cIC(handle);
      handle = 0;
      lastArgs = null;
    },
    get pending() {
      return Boolean(handle);
    },
  };
}
