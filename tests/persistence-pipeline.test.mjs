import { test } from "node:test";
import assert from "node:assert/strict";
import { createPersistencePipeline } from "../src/app/runtime/persistence-pipeline.js";

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

test("createPersistencePipeline rejects non-function input", () => {
  assert.throws(() => createPersistencePipeline("nope"), TypeError);
});

test("persist() debounces N rapid calls into one trailing save", async () => {
  let saves = [];
  const pipe = createPersistencePipeline((s) => saves.push(s), { timeout: 10 });
  for (let i = 0; i < 50; i += 1) pipe.persist({ rev: i });
  assert.equal(saves.length, 0, "must not save synchronously");
  assert.equal(pipe.pending, true);
  await tick(60);
  assert.equal(saves.length, 1, "50 calls collapse to one save");
  assert.deepEqual(saves[0], { rev: 49 }, "last value wins");
});

test("flush() / persistImmediate() drains pending and writes synchronously", () => {
  let saves = [];
  const pipe = createPersistencePipeline((s) => saves.push(s), { timeout: 1000 });
  pipe.persist({ x: 1 });
  pipe.flush({ x: 2 });
  assert.deepEqual(saves, [{ x: 2 }]);
});

test("bindLifecycleFlush wires pagehide+beforeunload+visibilitychange", async () => {
  let saves = [];
  const pipe = createPersistencePipeline((s) => saves.push(s), { timeout: 5 });
  const handlers = {};
  const fakeDoc = {
    visibilityState: "visible",
    addEventListener(name, fn) { handlers[`doc:${name}`] = fn; },
    removeEventListener(name) { delete handlers[`doc:${name}`]; },
  };
  const fakeWin = {
    document: fakeDoc,
    addEventListener(name, fn) { handlers[name] = fn; },
    removeEventListener(name) { delete handlers[name]; },
  };
  let snapshot = { tag: "v1" };
  const teardown = pipe.bindLifecycleFlush(fakeWin, () => snapshot);
  pipe.persist({ tag: "v2" });
  fakeDoc.visibilityState = "hidden";
  handlers["doc:visibilitychange"]();
  // Lifecycle flush should drain via the *current* state snapshot,
  // not the queued debounced value.
  assert.deepEqual(saves, [{ tag: "v1" }]);
  // beforeunload + pagehide too:
  snapshot = { tag: "v3" };
  handlers.beforeunload();
  handlers.pagehide();
  assert.deepEqual(saves.slice(-2), [{ tag: "v3" }, { tag: "v3" }]);
  teardown();
  assert.equal(handlers.pagehide, undefined);
});

test("bindLifecycleFlush returns a no-op cleanup when scope has no addEventListener", () => {
  const pipe = createPersistencePipeline(() => {}, { timeout: 5 });
  const cleanup = pipe.bindLifecycleFlush({}, () => ({}));
  assert.equal(typeof cleanup, "function");
  assert.doesNotThrow(() => cleanup());
});

test("bindLifecycleFlush requires a getState function", () => {
  const pipe = createPersistencePipeline(() => {}, { timeout: 5 });
  const fakeWin = { addEventListener() {}, removeEventListener() {} };
  assert.throws(() => pipe.bindLifecycleFlush(fakeWin), TypeError);
});

test("save errors are swallowed (quota exceeded etc.)", () => {
  const pipe = createPersistencePipeline(() => { throw new Error("quota"); }, { timeout: 5 });
  // Trailing call must not throw out of the debouncer.
  assert.doesNotThrow(() => pipe.persistImmediate({ x: 1 }));
});
