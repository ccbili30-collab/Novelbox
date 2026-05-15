import { test } from "node:test";
import assert from "node:assert/strict";
import { createFrameScheduler, createIdleDebouncer } from "../src/utils/scheduler.js";

function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 32));
}

test("frame scheduler coalesces N synchronous schedule() calls into one work() call", async () => {
  let count = 0;
  const sched = createFrameScheduler(() => { count += 1; });
  for (let i = 0; i < 100; i += 1) sched.schedule();
  assert.equal(count, 0, "work must not run synchronously");
  assert.equal(sched.pending, true);
  await nextTick();
  assert.equal(count, 1, "100 schedule() calls in one task collapse to one work()");
});

test("frame scheduler can be flushed synchronously", () => {
  let count = 0;
  const sched = createFrameScheduler(() => { count += 1; });
  sched.schedule();
  sched.flush();
  assert.equal(count, 1);
  assert.equal(sched.pending, false);
});

test("frame scheduler can be cancelled", async () => {
  let count = 0;
  const sched = createFrameScheduler(() => { count += 1; });
  sched.schedule();
  sched.cancel();
  await nextTick();
  assert.equal(count, 0);
});

test("frame scheduler passes the latest meta payload", async () => {
  let received = null;
  const sched = createFrameScheduler((meta) => { received = meta; });
  sched.schedule({ tag: "first" });
  sched.schedule({ tag: "second" });
  sched.schedule({ tag: "third" });
  await nextTick();
  assert.deepEqual(received, { tag: "third" });
});

test("idle debouncer trailing-edge fires once with last args", async () => {
  let calls = [];
  const deb = createIdleDebouncer((...args) => calls.push(args), { timeout: 10 });
  deb.schedule("a");
  deb.schedule("b");
  deb.schedule("c");
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(calls, [["c"]]);
});

test("idle debouncer flush() runs immediately", () => {
  let calls = [];
  const deb = createIdleDebouncer((...args) => calls.push(args), { timeout: 1000 });
  deb.schedule("x");
  deb.flush();
  assert.deepEqual(calls, [["x"]]);
});

test("idle debouncer cancel() drops pending work", async () => {
  let calls = 0;
  const deb = createIdleDebouncer(() => calls++, { timeout: 10 });
  deb.schedule();
  deb.cancel();
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(calls, 0);
});

test("createFrameScheduler rejects non-function input", () => {
  assert.throws(() => createFrameScheduler(null), TypeError);
});

test("createIdleDebouncer rejects non-function input", () => {
  assert.throws(() => createIdleDebouncer("nope"), TypeError);
});
