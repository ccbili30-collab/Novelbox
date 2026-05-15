import { test } from "node:test";
import assert from "node:assert/strict";
import { createStateContext } from "../src/app/runtime/state-context.js";

function makeState() {
  return {
    activeSessionId: "s1",
    sessions: [
      {
        id: "s1",
        settings: {},
        novel: null,
        roundtable: null,
      },
      { id: "s2", settings: {}, novel: null, roundtable: null },
    ],
    api: null,
    creators: null,
  };
}

test("createStateContext rejects non-function input", () => {
  assert.throws(() => createStateContext(null), TypeError);
  assert.throws(() => createStateContext("nope"), TypeError);
});

test("activeSession returns the session matching activeSessionId", () => {
  const state = makeState();
  const ctx = createStateContext(() => state);
  assert.equal(ctx.activeSession().id, "s1");
  state.activeSessionId = "s2";
  assert.equal(ctx.activeSession().id, "s2");
});

test("activeSession falls back to the first session when id missing", () => {
  const state = makeState();
  state.activeSessionId = "ghost";
  const ctx = createStateContext(() => state);
  assert.equal(ctx.activeSession().id, "s1");
});

test("apiSettings hydrates lazily and persists the hydrated form on state", () => {
  const state = makeState();
  const ctx = createStateContext(() => state);
  const a1 = ctx.apiSettings();
  assert.ok(a1, "apiSettings should return an object");
  assert.equal(state.api, a1, "the hydrated value should be written back to state.api");
});

test("creatorsState normalises non-object creators to {}", () => {
  const state = makeState();
  state.creators = null;
  const ctx = createStateContext(() => state);
  assert.deepEqual(ctx.creatorsState(), {});
  state.creators = "not a map";
  assert.deepEqual(ctx.creatorsState(), {});
});

test("sessionAppearance defaults user name to 我 when missing", () => {
  const state = makeState();
  const ctx = createStateContext(() => state);
  const ap = ctx.sessionAppearance();
  assert.equal(ap.userName, "我");
  assert.equal(ap.userAvatarDataUrl, "");
  assert.equal(ap.backgroundDataUrl, "");
});

test("sessionNovel filters version entries that have no body", () => {
  const state = makeState();
  state.sessions[0].novel = {
    body: "",
    versions: [
      { id: "a", body: "first" },
      null,
      { id: "b", body: "" },
      { id: "c", body: "third" },
    ],
  };
  const ctx = createStateContext(() => state);
  const novel = ctx.sessionNovel();
  assert.equal(novel.versions.length, 2);
  assert.equal(novel.versions[0].id, "a");
  assert.equal(novel.versions[1].id, "c");
});

test("roundtableState hydrates roundtable shape on first read", () => {
  const state = makeState();
  const ctx = createStateContext(() => state);
  const rt = ctx.roundtableState();
  assert.ok(rt && typeof rt === "object");
  // Re-read should return the same hydrated reference.
  assert.equal(ctx.roundtableState(), rt);
});

test("apiForProvider falls back to the active provider when the id is unknown", () => {
  const state = makeState();
  const ctx = createStateContext(() => state);
  const a = ctx.apiForProvider("does-not-exist");
  assert.ok(a && typeof a === "object");
  assert.ok(a.currentProviderId, "should have a current provider id");
});
