import { test } from "node:test";
import assert from "node:assert/strict";
import {
  simpleHash,
  replaceMentionsWithHtml,
} from "../src/app/runtime/text-utils.js";

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

test("simpleHash returns the same digit-string for the same input", () => {
  assert.equal(simpleHash("hello"), simpleHash("hello"));
});

test("simpleHash differs for different inputs", () => {
  assert.notEqual(simpleHash("a"), simpleHash("b"));
  assert.notEqual(simpleHash(""), simpleHash("0"));
});

test("simpleHash handles empty / null / undefined", () => {
  assert.equal(simpleHash(""), simpleHash(undefined));
  assert.equal(simpleHash(""), simpleHash(null));
  // Should always be a digit-string.
  assert.match(simpleHash("foo"), /^\d+$/);
});

test("replaceMentionsWithHtml escapes plain text and rewrites @mentions", () => {
  const out = replaceMentionsWithHtml({
    source: "hi <b>@alice</b> meet @bob",
    resolveTarget: (alias) => alias === "alice" ? { id: "u1", name: "Alice" } : null,
    renderHit: ({ raw, target, escapeHtml: esc }) => target
      ? `<a href="#${target.id}">${esc(raw)}</a>`
      : `<span class="unk">${esc(raw)}</span>`,
    escapeHtml,
  });
  assert.match(out, /<a href="#u1">@alice<\/a>/);
  assert.match(out, /<span class="unk">@bob<\/span>/);
  assert.match(out, /&lt;b&gt;/);
  assert.match(out, /&lt;\/b&gt;/);
});

test("replaceMentionsWithHtml handles CJK aliases", () => {
  const out = replaceMentionsWithHtml({
    source: "@小明 你好",
    resolveTarget: (alias) => ({ id: "x", name: alias }),
    renderHit: ({ raw }) => `[${raw}]`,
    escapeHtml,
  });
  assert.match(out, /\[@小明\]/);
});

test("replaceMentionsWithHtml uses normalizeAlias before resolveTarget", () => {
  const seen = [];
  replaceMentionsWithHtml({
    source: "@Alice and @ALICE",
    normalizeAlias: (s) => s.toLowerCase(),
    resolveTarget: (alias) => { seen.push(alias); return null; },
    renderHit: ({ raw }) => raw,
    escapeHtml,
  });
  assert.deepEqual(seen, ["alice", "alice"]);
});

test("replaceMentionsWithHtml returns '' for empty source", () => {
  assert.equal(replaceMentionsWithHtml({
    source: "",
    resolveTarget: () => null,
    renderHit: () => "",
    escapeHtml,
  }), "");
});

test("replaceMentionsWithHtml is reentrant (regex state is reset)", () => {
  const args = {
    source: "@a @b @c",
    resolveTarget: () => null,
    renderHit: ({ raw }) => `[${raw}]`,
    escapeHtml,
  };
  const a = replaceMentionsWithHtml(args);
  const b = replaceMentionsWithHtml(args);
  assert.equal(a, b);
  assert.equal(a, "[@a] [@b] [@c]");
});
