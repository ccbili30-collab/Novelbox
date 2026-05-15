/**
 * Render pipeline.
 *
 * Wraps a renderNow() callable in a frame scheduler so that every
 * render() call site (the legacy main.js had 64 of them) gets
 * coalesced into one rAF tick. Mirrors persistence-pipeline.js so
 * the API shape is consistent.
 *
 * Returns:
 *   - render():           schedule a render on the next rAF tick.
 *   - renderImmediate():  flush any pending tick + invoke renderNow
 *                         synchronously now (used after critical
 *                         state changes that need to be visible
 *                         before the next user interaction).
 *   - pending: getter, true while a render is queued.
 */

import { createFrameScheduler } from "../../utils/scheduler.js";

export function createRenderPipeline(renderNow) {
  if (typeof renderNow !== "function") {
    throw new TypeError("createRenderPipeline requires a renderNow function");
  }
  const scheduler = createFrameScheduler(() => renderNow());
  return {
    render() { scheduler.schedule(); },
    /**
     * Force a render right now. If a render was already queued, the
     * scheduler.flush() runs it synchronously and we're done — no
     * duplicate work. Otherwise we invoke renderNow() ourselves.
     */
    renderImmediate() {
      if (scheduler.pending) scheduler.flush();
      else renderNow();
    },
    cancel() { scheduler.cancel(); },
    get pending() { return scheduler.pending; },
  };
}
