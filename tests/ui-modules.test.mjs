/**
 * Smoke-test every new ui module: import it, verify the documented
 * API surface exists and is callable. node:test runs in pure Node so
 * any DOM-touching path is tested via try/catch — we only assert that
 * the module loads, exports the expected names, and that the
 * pure-logic helpers (no DOM) behave correctly.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

test("snackbar module exports showSnackbar and showError", async () => {
  const mod = await import("../src/ui/components/snackbar.js");
  assert.equal(typeof mod.showSnackbar, "function");
  assert.equal(typeof mod.showError, "function");
});

test("snackbar: showSnackbar() with no message is a no-op (no throw)", async () => {
  const { showSnackbar } = await import("../src/ui/components/snackbar.js");
  assert.doesNotThrow(() => showSnackbar(""));
  assert.doesNotThrow(() => showSnackbar(null));
  assert.doesNotThrow(() => showSnackbar(undefined));
});

test("dialog module exports showConfirm, showAlert, showPrompt", async () => {
  const mod = await import("../src/ui/components/dialog.js");
  assert.equal(typeof mod.showConfirm, "function");
  assert.equal(typeof mod.showAlert, "function");
  assert.equal(typeof mod.showPrompt, "function");
});

test("theme-engine module exports public API", async () => {
  const mod = await import("../src/ui/components/theme-engine.js");
  for (const name of [
    "buildTonalPalette",
    "getThemeMode", "setThemeMode",
    "getSeedColor", "setSeedColor",
    "initThemeEngine",
  ]) {
    assert.equal(typeof mod[name], "function", `${name} should be exported as a function`);
  }
});

test("keyboard-help module exports openKeyboardHelp + binder + isOpen", async () => {
  const mod = await import("../src/ui/components/keyboard-help.js");
  assert.equal(typeof mod.openKeyboardHelp, "function");
  assert.equal(typeof mod.bindKeyboardHelpShortcut, "function");
  assert.equal(typeof mod.isKeyboardHelpOpen, "function");
  // No DOM; isOpen() must safely return a boolean.
  assert.equal(mod.isKeyboardHelpOpen(), false);
});

test("scroll-aware-bars module exports bindScrollAwareBar; safe with falsy args", async () => {
  const { bindScrollAwareBar } = await import("../src/ui/components/scroll-aware-bars.js");
  assert.equal(typeof bindScrollAwareBar, "function");
  // Passing null/undefined must not throw and must return a no-op cleanup function.
  const cleanup = bindScrollAwareBar(null, null);
  assert.equal(typeof cleanup, "function");
  assert.doesNotThrow(() => cleanup());
});

test("scheduler module is still importable and exports both helpers", async () => {
  const mod = await import("../src/utils/scheduler.js");
  assert.equal(typeof mod.createFrameScheduler, "function");
  assert.equal(typeof mod.createIdleDebouncer, "function");
});

test("session-renderer module exports renderSessions and is callable", async () => {
  const { renderSessions } = await import("../src/ui/renderers/session-renderer.js");
  assert.equal(typeof renderSessions, "function");
});

test("whats-new module exports VERSION + checkAndAnnounceUpgrade", async () => {
  const { VERSION, checkAndAnnounceUpgrade } = await import("../src/ui/components/whats-new.js");
  assert.equal(typeof VERSION, "string");
  assert.match(VERSION, /\d+\.\d+/);
  assert.equal(typeof checkAndAnnounceUpgrade, "function");
});
