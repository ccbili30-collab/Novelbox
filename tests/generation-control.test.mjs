import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runStopHooks,
  createGenerationControl,
} from "../src/app/runtime/generation-control.js";

test("runStopHooks: returns false when no tokens are present", () => {
  const r = runStopHooks({ hooks: { onAbort: () => {} } });
  assert.equal(r, false);
});

test("runStopHooks: invokes onAbort with the controller, plus the two cancel hooks", () => {
  const calls = [];
  const ac = { abort() { calls.push("aborted"); } };
  const r = runStopHooks({
    abortController: ac,
    bridgeRequestId: "b1",
    streamRequestId: "s1",
    hooks: {
      onAbort: (a) => { calls.push("abort"); a.abort(); },
      onCancelBridge: (id) => calls.push(`bridge:${id}`),
      onCancelStream: (id) => calls.push(`stream:${id}`),
    },
  });
  assert.equal(r, true);
  assert.deepEqual(calls, ["abort", "aborted", "bridge:b1", "stream:s1"]);
});

test("runStopHooks: an exception in one hook does not stop the rest", () => {
  const calls = [];
  runStopHooks({
    abortController: {},
    bridgeRequestId: "b",
    streamRequestId: "s",
    hooks: {
      onAbort: () => { throw new Error("boom"); },
      onCancelBridge: () => calls.push("bridge"),
      onCancelStream: () => calls.push("stream"),
    },
  });
  assert.deepEqual(calls, ["bridge", "stream"]);
});

test("createGenerationControl: starts inactive", () => {
  const c = createGenerationControl();
  assert.equal(c.isActive(), false);
  assert.equal(c.isStreamingNode("anything"), false);
});

test("createGenerationControl: start + isStreamingNode tracks the active node", () => {
  const c = createGenerationControl();
  c.start({ nodeId: "n1" });
  assert.equal(c.isActive(), true);
  assert.equal(c.isStreamingNode("n1"), true);
  assert.equal(c.isStreamingNode("n2"), false);
});

test("createGenerationControl: stop fires every present hook and clears state", () => {
  const c = createGenerationControl();
  const calls = [];
  const ac = { abort: () => calls.push("abort") };
  c.start({ nodeId: "n1", abortController: ac, bridgeRequestId: "b1", streamRequestId: "s1" });
  const ok = c.stop({
    onAbort: (a) => a.abort(),
    onCancelBridge: (id) => calls.push(`bridge:${id}`),
    onCancelStream: (id) => calls.push(`stream:${id}`),
    onAfter: () => calls.push("after"),
  });
  assert.equal(ok, true);
  assert.deepEqual(calls, ["abort", "bridge:b1", "stream:s1", "after"]);
  assert.equal(c.isActive(), false);
  assert.equal(c.nodeId, null);
});

test("createGenerationControl: stop on inactive controller is a no-op", () => {
  const c = createGenerationControl();
  let after = 0;
  const ok = c.stop({ onAfter: () => after++ });
  assert.equal(ok, false);
  assert.equal(after, 0);
});

test("createGenerationControl: updateBridgeRequestId / updateStreamRequestId mutate the tokens", () => {
  const c = createGenerationControl();
  c.start({ nodeId: "n" });
  c.updateBridgeRequestId("b-new");
  c.updateStreamRequestId("s-new");
  assert.equal(c.bridgeRequestId, "b-new");
  assert.equal(c.streamRequestId, "s-new");
});

test("createGenerationControl: reset clears state without invoking hooks", () => {
  const c = createGenerationControl();
  let abortCalls = 0;
  c.start({ nodeId: "n", abortController: { abort: () => abortCalls++ } });
  c.reset();
  assert.equal(c.isActive(), false);
  assert.equal(abortCalls, 0);
});
