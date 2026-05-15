import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCommandMap } from "../src/app/runtime/command-registry-config.js";

test("buildCommandMap returns an object map of every documented route", () => {
  const map = buildCommandMap({});
  assert.ok(typeof map === "object");
  // A few representative routes that the registry must always have.
  for (const route of [
    "open-history", "open-settings", "close-panels", "new-session",
    "switch-session", "delete-session", "toggle-roundtable",
    "regen-ai", "prev-version", "next-version",
    "layout-preset", "save-layout-preset",
    "select-model", "save-novel",
  ]) {
    assert.equal(typeof map[route], "function", `route ${route} missing`);
  }
});

test("buildCommandMap with no handlers wraps every route in a safe no-op", () => {
  const map = buildCommandMap({});
  // Calling each route must not throw, regardless of args.
  const fakeTarget = { dataset: {} };
  for (const route of Object.keys(map)) {
    assert.doesNotThrow(
      () => map[route](fakeTarget),
      `route ${route} threw on empty handlers`
    );
  }
});

test("buildCommandMap routes targetless handlers to the supplied function", () => {
  let calls = 0;
  const map = buildCommandMap({ newSession: () => calls++ });
  map["new-session"]();
  assert.equal(calls, 1);
});

test("buildCommandMap routes target-bearing handlers and forwards data attributes", () => {
  let captured = null;
  const map = buildCommandMap({
    switchSession: (id) => { captured = id; },
  });
  map["switch-session"]({ dataset: { sessionId: "s42" } });
  assert.equal(captured, "s42");
});

test("buildCommandMap layout-step coerces step to a number", () => {
  let lastArgs = null;
  const map = buildCommandMap({
    stepLayoutValue: (key, step) => { lastArgs = [key, step]; },
  });
  map["layout-step"]({ dataset: { layoutKey: "messageGap", step: "3" } });
  assert.deepEqual(lastArgs, ["messageGap", 3]);
});

test("buildCommandMap composer mode comparison uses the supplied getPrimaryCreatorId", () => {
  const seen = [];
  const map = buildCommandMap({
    getPrimaryCreatorId: () => "creator-1",
    openAssistantConfig: (id, opts) => seen.push({ id, mode: opts?.mode }),
  });
  map["open-creator-config"]({ dataset: { creatorId: "creator-1" } });
  map["open-creator-config"]({ dataset: { creatorId: "creator-2" } });
  assert.deepEqual(seen, [
    { id: "creator-1", mode: "creator" },
    { id: "creator-2", mode: "member" },
  ]);
});
