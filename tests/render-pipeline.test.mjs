import { test } from "node:test";
import assert from "node:assert/strict";
import { createRenderPipeline } from "../src/app/runtime/render-pipeline.js";

const tick = () => new Promise((r) => setTimeout(r, 32));

test("createRenderPipeline rejects non-function input", () => {
  assert.throws(() => createRenderPipeline(null), TypeError);
});

test("render() coalesces 100 schedule calls into one renderNow per frame", async () => {
  let calls = 0;
  const pipe = createRenderPipeline(() => { calls += 1; });
  for (let i = 0; i < 100; i += 1) pipe.render();
  assert.equal(calls, 0);
  assert.equal(pipe.pending, true);
  await tick();
  assert.equal(calls, 1);
});

test("renderImmediate() flushes pending and runs renderNow synchronously", () => {
  let calls = 0;
  const pipe = createRenderPipeline(() => { calls += 1; });
  pipe.render();
  pipe.renderImmediate();
  assert.equal(calls, 1);
  assert.equal(pipe.pending, false);
});

test("cancel() drops pending render", async () => {
  let calls = 0;
  const pipe = createRenderPipeline(() => { calls += 1; });
  pipe.render();
  pipe.cancel();
  await tick();
  assert.equal(calls, 0);
});
