/**
 * Gesture controllers extracted from main.js.
 *
 * Two factories:
 *   - createPinchZoomGesture({ getRoundtable, isPanelOpen, ... })
 *       Owns the two-finger pinch-in detector that flips the chat
 *       into roundtable mode, plus a lockRootScroll helper.
 *   - createPaperDragGesture({ ctx, els, hooks })
 *       Owns the manuscript paper drag + double-tap controllers.
 *
 * touchDistance(touches) is exported as a pure helper.
 */

export function touchDistance(touches) {
  if (!touches || touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

export function lockRootScroll(win = typeof window !== "undefined" ? window : null,
                                doc = typeof document !== "undefined" ? document : null) {
  if (win && (win.scrollX || win.scrollY)) win.scrollTo(0, 0);
  if (doc?.documentElement?.scrollTop) doc.documentElement.scrollTop = 0;
  if (doc?.body?.scrollTop) doc.body.scrollTop = 0;
}

/**
 * Pinch-in to enter roundtable mode.
 *
 * deps: {
 *   isRoundtableEnabled(): boolean,
 *   isOverlayBlocking(): boolean,    // a dialog or side panel is up
 *   onPinchEnter(message): void,
 * }
 */
export function createPinchZoomGesture({ isRoundtableEnabled, isOverlayBlocking, onPinchEnter }) {
  const state = { active: false, triggered: false, startDistance: 0 };
  function reset() { state.active = false; state.triggered = false; state.startDistance = 0; }
  return {
    onTouchStart(event) {
      if (isRoundtableEnabled() || event.touches.length !== 2 || isOverlayBlocking()) return;
      state.active = true;
      state.triggered = false;
      state.startDistance = touchDistance(event.touches);
    },
    onTouchMove(event) {
      if (!state.active || state.triggered || event.touches.length !== 2) return;
      const currentDistance = touchDistance(event.touches);
      const startDistance = state.startDistance || currentDistance;
      const inwardDelta = startDistance - currentDistance;
      if (startDistance > 120 && inwardDelta > 44 && currentDistance / startDistance < 0.78) {
        state.triggered = true;
        onPinchEnter?.("已通过双指手势进入圆桌");
      }
    },
    onTouchEnd: reset,
    onTouchCancel: reset,
    /** Inspection helper for tests. */
    _state: state,
  };
}

/**
 * Manuscript paper double-tap to leave roundtable.
 *
 * deps: { isRoundtableEnabled(), onLeaveRoundtable(message) }
 */
export function createPaperDoubleTapGesture({ isRoundtableEnabled, onLeaveRoundtable, doubleTapMs = 320 }) {
  const state = { lastTapAt: 0, startX: 0, startY: 0 };
  function isInteractive(target) {
    return Boolean(target?.closest?.("button, input, textarea, select, summary"));
  }
  function tap(event) {
    if (!isRoundtableEnabled() || isInteractive(event.target)) return;
    const now = Date.now();
    if (now - state.lastTapAt < doubleTapMs) {
      state.lastTapAt = 0;
      onLeaveRoundtable?.("已回到交流模式");
      event.preventDefault?.();
      return;
    }
    state.lastTapAt = now;
  }
  return {
    onDoubleTap: tap,
    onTouchStart(event) {
      if (!isRoundtableEnabled() || event.touches.length !== 1) return;
      const t = event.touches[0];
      state.startX = t.clientX;
      state.startY = t.clientY;
    },
    onTouchEnd(event) {
      if (!isRoundtableEnabled() || event.changedTouches.length !== 1) return;
      const t = event.changedTouches[0];
      const moved = Math.hypot(t.clientX - state.startX, t.clientY - state.startY);
      if (moved > 10) return;
      tap(event);
    },
    _state: state,
  };
}
