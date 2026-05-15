import { test } from "node:test";
import assert from "node:assert/strict";
import {
  prefersReducedMotion,
  vibrateLight,
  createPulse,
  createRipple,
  createToast,
} from "../src/app/runtime/feedback.js";

test("prefersReducedMotion returns false in node (no window.matchMedia)", () => {
  assert.equal(prefersReducedMotion(), false);
});

test("vibrateLight is a no-op when navigator.vibrate is missing", () => {
  // node:test environment — navigator is undefined; should not throw.
  assert.doesNotThrow(() => vibrateLight("delete"));
  assert.doesNotThrow(() => vibrateLight("send"));
  assert.doesNotThrow(() => vibrateLight());
});

test("createPulse returns a callable that no-ops on falsy element", () => {
  const pulse = createPulse(100);
  assert.equal(typeof pulse, "function");
  assert.doesNotThrow(() => pulse(null));
  assert.doesNotThrow(() => pulse(undefined));
});

test("createRipple returns a callable that no-ops on falsy args", () => {
  const ripple = createRipple(100);
  assert.equal(typeof ripple, "function");
  assert.doesNotThrow(() => ripple(null, null));
  assert.doesNotThrow(() => ripple({}, null));
});

test("createToast prefers the snackbar adapter", () => {
  let captured = null;
  const fakeSnackbar = (msg, opts) => { captured = { msg, opts }; };
  const toast = createToast({ toast: null }, fakeSnackbar);
  toast("hi");
  assert.deepEqual(captured, { msg: "hi", opts: { short: true } });
});

test("createToast legacy fallback path is a safe no-op when window is missing", () => {
  // node:test runs without globalThis.window. The legacy path must
  // bail out cleanly rather than throw ReferenceError.
  const noisySnackbar = () => { throw new Error("no DOM"); };
  const fakeToast = { /* never read because we bail before window use */ };
  const toast = createToast({ toast: fakeToast }, noisySnackbar);
  assert.doesNotThrow(() => toast("oops"));
});

test("createToast is a no-op for null/undefined messages", () => {
  let snackbarCalls = 0;
  const fakeSnackbar = () => { snackbarCalls += 1; };
  const toast = createToast({ toast: null }, fakeSnackbar);
  toast(null);
  toast(undefined);
  assert.equal(snackbarCalls, 0);
});
