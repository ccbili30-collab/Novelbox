import { test } from "node:test";
import assert from "node:assert/strict";
import { createStreamBatcher } from "../src/app/runtime/stream-batcher.js";

test("schedule fires callback after delay", async () => {
  const calls = [];
  const b = createStreamBatcher();
  b.schedule("k1", () => calls.push("k1"), 5);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(calls, ["k1"]);
  assert.deepEqual(b.pendingKeys(), []);
});

test("schedule is first-in-wins (no double-queue per key)", async () => {
  const calls = [];
  const b = createStreamBatcher();
  b.schedule("k", () => calls.push("first"), 5);
  b.schedule("k", () => calls.push("second"), 5);
  b.schedule("k", () => calls.push("third"), 5);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(calls, ["first"]);
});

test("cancel(key) drops a pending callback before it fires", async () => {
  const calls = [];
  const b = createStreamBatcher();
  b.schedule("k", () => calls.push("ran"), 5);
  b.cancel("k");
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(calls, []);
});

test("cancel() with no key drops every pending callback", async () => {
  const calls = [];
  const b = createStreamBatcher();
  b.schedule("a", () => calls.push("a"), 5);
  b.schedule("b", () => calls.push("b"), 5);
  b.schedule("c", () => calls.push("c"), 5);
  b.cancel();
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(calls, []);
});

test("renderer errors are swallowed so streaming continues", async () => {
  const calls = [];
  const b = createStreamBatcher();
  b.schedule("oops", () => { throw new Error("kaboom"); }, 5);
  b.schedule("ok",   () => calls.push("ok"),                 5);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(calls, ["ok"]);
});

test("pendingKeys reflects scheduled callbacks", () => {
  const b = createStreamBatcher();
  b.schedule("a", () => {}, 1000);
  b.schedule("b", () => {}, 1000);
  assert.deepEqual(b.pendingKeys().sort(), ["a", "b"]);
  b.cancel();
});

test("createStreamBatcher refuses missing setTimeout/clearTimeout", () => {
  assert.throws(
    () => createStreamBatcher({ setTimeout: null, clearTimeout: null }),
    TypeError,
  );
});
