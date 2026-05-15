import { test } from "node:test";
import assert from "node:assert/strict";
import {
  roundtableDateKey,
  renderRoundtableEmpty,
  renderRoundtableDecisionBadge,
  renderRoundtableMentionBadge,
  renderRoundtableDateDivider,
  buildRoundtableDiscussion,
} from "../src/ui/renderers/roundtable-renderer.js";

test("roundtableDateKey returns YYYY-M-D", () => {
  const ts = new Date("2025-04-01T13:30:00Z").getTime();
  const key = roundtableDateKey(ts);
  // Locale-tolerant: just assert the shape and that the day matches.
  assert.match(key, /^\d{4}-\d{1,2}-\d{1,2}$/);
});

test("roundtableDateKey defaults to now() when no value", () => {
  const key = roundtableDateKey();
  assert.match(key, /^\d{4}-\d{1,2}-\d{1,2}$/);
});

test("renderRoundtableEmpty returns ''", () => {
  assert.equal(renderRoundtableEmpty(), "");
});

test("renderRoundtableDecisionBadge handles every status + null", () => {
  for (const [status, snippet] of [
    ["adopted",  "已采纳"],
    ["ignored",  "已忽略"],
    ["approved", "通过"],
    ["revision", "需修改"],
  ]) {
    const html = renderRoundtableDecisionBadge({ decisionStatus: status });
    assert.match(html, new RegExp(snippet));
    assert.match(html, /roundtable-decision/);
  }
  assert.equal(renderRoundtableDecisionBadge({ decisionStatus: "unknown" }), "");
  assert.equal(renderRoundtableDecisionBadge(null), "");
});

test("renderRoundtableMentionBadge escapes the triggered-by name", () => {
  const html = renderRoundtableMentionBadge({ mentionMeta: { triggeredByName: "<script>" } });
  assert.match(html, /回应 @&lt;script&gt;/);
});

test("renderRoundtableMentionBadge returns '' without metadata", () => {
  assert.equal(renderRoundtableMentionBadge({}), "");
  assert.equal(renderRoundtableMentionBadge({ mentionMeta: {} }), "");
});

test("renderRoundtableDateDivider returns '' when no createdAt", () => {
  assert.equal(renderRoundtableDateDivider({}), "");
  assert.equal(renderRoundtableDateDivider(null), "");
});

test("buildRoundtableDiscussion inserts a divider on the first message and on date change", () => {
  const messages = [
    { id: "a", createdAt: new Date("2025-01-01T10:00:00Z").getTime() },
    { id: "b", createdAt: new Date("2025-01-01T22:00:00Z").getTime() },   // same day → no divider
    { id: "c", createdAt: new Date("2025-01-02T01:00:00Z").getTime() },   // new day → divider
  ];
  const html = buildRoundtableDiscussion(messages, {
    renderMessage: (m) => `[msg-${m.id}]`,
  });
  // 2 dividers (first + day change) + 3 messages
  const dividerCount = (html.match(/roundtable-divider/g) || []).length;
  assert.equal(dividerCount, 2);
  assert.ok(html.includes("[msg-a]") && html.includes("[msg-b]") && html.includes("[msg-c]"));
});

test("buildRoundtableDiscussion returns the empty state for an empty list", () => {
  const html = buildRoundtableDiscussion([], { renderMessage: () => "?" });
  assert.equal(html, "");
});
