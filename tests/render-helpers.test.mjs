import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cssEscape,
  renderChatContent,
  renderBranchSwitcher,
  renderVersionSwitcher,
} from "../src/app/runtime/render-helpers.js";

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));
const renderAssistantMarkdown = (s) => `<p>${escapeHtml(s)}</p>`;

test("cssEscape escapes quotes and backslashes when CSS.escape is missing", () => {
  // node has no globalThis.CSS so the fallback branch is exercised.
  assert.equal(cssEscape('a"b\\c'), 'a\\"b\\\\c');
});

test("renderChatContent returns empty string when no content + not streaming", () => {
  assert.equal(
    renderChatContent({ role: "assistant" }, "", false, { renderAssistantMarkdown, escapeHtml }),
    ""
  );
});

test("renderChatContent renders assistant markdown wrapper", () => {
  const html = renderChatContent({ role: "assistant" }, "hello", false, { renderAssistantMarkdown, escapeHtml });
  assert.match(html, /message-markdown/);
  assert.match(html, /<p>hello<\/p>/);
});

test("renderChatContent escapes user text", () => {
  const html = renderChatContent({ role: "user" }, "<script>", false, { renderAssistantMarkdown, escapeHtml });
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test("renderBranchSwitcher returns empty when there are no siblings", () => {
  const node = { id: "n1", parentId: "p" };
  const getNode = () => ({ children: ["n1"] });
  assert.equal(renderBranchSwitcher(node, { getNode }), "");
});

test("renderBranchSwitcher emits chevron buttons + 1-based index", () => {
  const node = { id: "n2", parentId: "p" };
  const getNode = () => ({ children: ["n1", "n2", "n3"] });
  const html = renderBranchSwitcher(node, { getNode });
  assert.match(html, /switcher--branch/);
  assert.match(html, /chevron_left/);
  assert.match(html, /chevron_right/);
  assert.match(html, /switcher__index">2\/3</);
});

test("renderVersionSwitcher returns empty for user nodes / single-version assistants", () => {
  assert.equal(renderVersionSwitcher({ role: "user" }), "");
  assert.equal(renderVersionSwitcher({ role: "assistant", versions: [{}] }), "");
});

test("renderVersionSwitcher renders the active version index", () => {
  const node = {
    id: "n", role: "assistant",
    activeVersionId: "v2",
    versions: [{ id: "v1" }, { id: "v2" }, { id: "v3" }],
  };
  const html = renderVersionSwitcher(node);
  assert.match(html, /switcher__index">2\/3</);
  assert.match(html, /aria-label="版本切换"/);
});
