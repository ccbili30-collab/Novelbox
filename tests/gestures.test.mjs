import { test } from "node:test";
import assert from "node:assert/strict";
import {
  touchDistance,
  lockRootScroll,
  createPinchZoomGesture,
  createPaperDoubleTapGesture,
} from "../src/app/runtime/gestures.js";

test("touchDistance: 0 for missing or single-touch input", () => {
  assert.equal(touchDistance(null), 0);
  assert.equal(touchDistance([]), 0);
  assert.equal(touchDistance([{ clientX: 0, clientY: 0 }]), 0);
});

test("touchDistance: hypot for two touches", () => {
  const d = touchDistance([
    { clientX: 0, clientY: 0 },
    { clientX: 3, clientY: 4 },
  ]);
  assert.equal(d, 5);
});

test("lockRootScroll is safe when no window/document", () => {
  assert.doesNotThrow(() => lockRootScroll(null, null));
});

test("pinch gesture triggers onPinchEnter when fingers come close enough", () => {
  let entered = null;
  const g = createPinchZoomGesture({
    isRoundtableEnabled: () => false,
    isOverlayBlocking: () => false,
    onPinchEnter: (msg) => { entered = msg; },
  });
  // 200 → 100 (50% closer): startDistance > 120, inwardDelta=100>44, ratio=0.5<0.78
  g.onTouchStart({ touches: [
    { clientX: 0, clientY: 0 },
    { clientX: 200, clientY: 0 },
  ]});
  g.onTouchMove({ touches: [
    { clientX: 0, clientY: 0 },
    { clientX: 100, clientY: 0 },
  ]});
  assert.equal(entered, "已通过双指手势进入圆桌");
});

test("pinch gesture is suppressed when overlay is blocking", () => {
  let entered = null;
  const g = createPinchZoomGesture({
    isRoundtableEnabled: () => false,
    isOverlayBlocking: () => true,
    onPinchEnter: (msg) => { entered = msg; },
  });
  g.onTouchStart({ touches: [
    { clientX: 0, clientY: 0 },
    { clientX: 200, clientY: 0 },
  ]});
  g.onTouchMove({ touches: [
    { clientX: 0, clientY: 0 },
    { clientX: 50, clientY: 0 },
  ]});
  assert.equal(entered, null);
});

test("pinch gesture is no-op when already in roundtable mode", () => {
  let entered = null;
  const g = createPinchZoomGesture({
    isRoundtableEnabled: () => true,
    isOverlayBlocking: () => false,
    onPinchEnter: (msg) => { entered = msg; },
  });
  g.onTouchStart({ touches: [
    { clientX: 0, clientY: 0 },
    { clientX: 200, clientY: 0 },
  ]});
  g.onTouchMove({ touches: [
    { clientX: 0, clientY: 0 },
    { clientX: 50, clientY: 0 },
  ]});
  assert.equal(entered, null);
});

test("paper double-tap fires onLeaveRoundtable on the second tap within window", () => {
  let left = null;
  const g = createPaperDoubleTapGesture({
    isRoundtableEnabled: () => true,
    onLeaveRoundtable: (msg) => { left = msg; },
    doubleTapMs: 1000,
  });
  const ev = { target: { closest: () => null }, preventDefault() {} };
  g.onDoubleTap(ev);
  assert.equal(left, null);
  g.onDoubleTap(ev);
  assert.equal(left, "已回到交流模式");
});

test("paper double-tap is suppressed on interactive descendants", () => {
  let left = null;
  const g = createPaperDoubleTapGesture({
    isRoundtableEnabled: () => true,
    onLeaveRoundtable: (msg) => { left = msg; },
    doubleTapMs: 1000,
  });
  const ev = { target: { closest: (sel) => sel.includes("button") ? {} : null }, preventDefault() {} };
  g.onDoubleTap(ev); g.onDoubleTap(ev);
  assert.equal(left, null);
});
