import { test } from "node:test";
import assert from "node:assert/strict";
import { createLayoutPresetController } from "../src/app/runtime/layout-presets.js";

function makeDeps(overrides = {}) {
  let counter = 0;
  return {
    presets: { compact: { messageGap: 8 }, comfy: { messageGap: 16 } },
    sessionSettings: () => ({ layout: { messageGap: 12 }, layoutPresets: [] }),
    hydrateLayout: (raw) => ({ ...raw, _hydrated: true }),
    createDefaultLayout: () => ({ messageGap: 12, _default: true }),
    uid: (prefix) => `${prefix}-${++counter}`,
    clean: (s) => String(s ?? "").trim(),
    render: () => {},
    resizeInput: () => {},
    persist: () => {},
    showToast: () => {},
    copyText: async (text) => text,
    presetNameInput: null,
    ...overrides,
  };
}

test("applyLayoutPreset writes hydrated layout and toasts", () => {
  let toast = null;
  let renders = 0;
  const settings = { layout: {}, layoutPresets: [] };
  const ctrl = createLayoutPresetController(makeDeps({
    sessionSettings: () => settings,
    showToast: (m) => { toast = m; },
    render: () => { renders++; },
  }));
  ctrl.applyLayoutPreset("compact");
  assert.equal(settings.layout.messageGap, 8);
  assert.equal(settings.layout._hydrated, true);
  assert.equal(toast, "排版预设已应用");
  assert.equal(renders, 1);
});

test("applyLayoutPreset is a no-op for unknown name", () => {
  let toast = null;
  const settings = { layout: { _orig: true }, layoutPresets: [] };
  const ctrl = createLayoutPresetController(makeDeps({
    sessionSettings: () => settings,
    showToast: (m) => { toast = m; },
  }));
  ctrl.applyLayoutPreset("ghost");
  assert.equal(settings.layout._orig, true);
  assert.equal(toast, null);
});

test("saveLayoutPreset prepends a record and clips to 12 entries", () => {
  const settings = { layout: { messageGap: 5 }, layoutPresets: [] };
  for (let i = 0; i < 14; i += 1) settings.layoutPresets.push({ id: `legacy-${i}`, name: `legacy ${i}`, layout: {} });
  const ctrl = createLayoutPresetController(makeDeps({
    sessionSettings: () => settings,
    presetNameInput: { value: "" },
  }));
  const record = ctrl.saveLayoutPreset();
  assert.equal(settings.layoutPresets.length, 12);
  assert.equal(settings.layoutPresets[0], record);
  assert.match(record.name, /^排版 \d+$/);
});

test("saveLayoutPreset uses the input value when present and clears it", () => {
  const input = { value: "  我的预设  " };
  const settings = { layout: {}, layoutPresets: [] };
  const ctrl = createLayoutPresetController(makeDeps({
    sessionSettings: () => settings,
    presetNameInput: input,
  }));
  const record = ctrl.saveLayoutPreset();
  assert.equal(record.name, "我的预设");
  assert.equal(input.value, "");
});

test("deleteLayoutPreset removes by id", () => {
  const settings = { layout: {}, layoutPresets: [
    { id: "a", layout: {} }, { id: "b", layout: {} }, { id: "c", layout: {} },
  ]};
  const ctrl = createLayoutPresetController(makeDeps({ sessionSettings: () => settings }));
  ctrl.deleteLayoutPreset("b");
  assert.deepEqual(settings.layoutPresets.map((p) => p.id), ["a", "c"]);
});

test("resetLayoutParams swaps in createDefaultLayout()", () => {
  const settings = { layout: { messageGap: 99 }, layoutPresets: [] };
  const ctrl = createLayoutPresetController(makeDeps({ sessionSettings: () => settings }));
  ctrl.resetLayoutParams();
  assert.equal(settings.layout._default, true);
});

test("copyLayoutParams stringifies the current layout", async () => {
  let copied = null;
  const settings = { layout: { messageGap: 12 }, layoutPresets: [] };
  const ctrl = createLayoutPresetController(makeDeps({
    sessionSettings: () => settings,
    copyText: async (text) => { copied = text; },
  }));
  await ctrl.copyLayoutParams();
  const parsed = JSON.parse(copied);
  assert.equal(parsed.messageGap, 12);
});
