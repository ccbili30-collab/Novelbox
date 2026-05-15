import { test } from "node:test";
import assert from "node:assert/strict";
import { bootMd3 } from "../src/app/runtime/bootstrap-md3.js";

test("bootMd3 silently no-ops without doc / win / els", () => {
  assert.doesNotThrow(() => bootMd3({}));
  assert.doesNotThrow(() => bootMd3({ doc: null, win: null, els: {} }));
});

test("bootMd3 with all features off is a no-op", () => {
  assert.doesNotThrow(() => bootMd3({
    doc: { addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; }, getElementById() { return null; } },
    win: { addEventListener() {}, requestAnimationFrame() { return 0; } },
    els: {},
    features: {
      theme: false,
      scrollAwareBar: false,
      keyboardHelp: false,
      whatsNew: false,
      scrollFab: false,
    },
  }));
});

test("bootMd3 exports a callable function", () => {
  assert.equal(typeof bootMd3, "function");
});
