import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getMessageContent,
  normalizeChatAttachments,
  getMessageRenderSignature,
} from "../src/app/runtime/message-signature.js";

const versions = (node) => ({ content: node?.versions?.find((v) => v.id === node?.activeVersionId)?.content || "" });

test("getMessageContent returns user content for user nodes", () => {
  assert.equal(getMessageContent({ role: "user", content: "hi" }, () => null), "hi");
});

test("getMessageContent returns active assistant version content", () => {
  const node = { role: "assistant", activeVersionId: "v1", versions: [{ id: "v1", content: "answer" }] };
  assert.equal(getMessageContent(node, versions), "answer");
});

test("getMessageContent handles null nodes", () => {
  assert.equal(getMessageContent(null, () => null), "");
});

test("normalizeChatAttachments filters empty entries and respects limit", () => {
  const items = normalizeChatAttachments([
    { name: "a.png", dataUrl: "data:..." },
    { /* nothing */ },
    { textExcerpt: "summary" },
    { name: "skip" },
    { dataUrl: "y" },
    { dataUrl: "z" },
    { dataUrl: "w" },
  ], { limit: 3 });
  assert.equal(items.length, 3);
  assert.ok(items.every((i) => i.id && i.kind && i.name));
});

test("normalizeChatAttachments truncates textExcerpt to textLimit", () => {
  const huge = "x".repeat(20000);
  const [item] = normalizeChatAttachments([{ name: "long.md", textExcerpt: huge }], { textLimit: 50 });
  assert.equal(item.textExcerpt.length, 50);
});

test("getMessageRenderSignature is stable for identical nodes", () => {
  const node = {
    id: "n1", role: "user", parentId: null, content: "hi",
    activeVersionId: "", versions: [], createdAt: 1000,
  };
  const deps = {
    getAssistantVersion: () => null,
    getNode: () => null,
    isStreamingNodeId: () => false,
  };
  assert.equal(getMessageRenderSignature(node, deps), getMessageRenderSignature(node, deps));
});

test("getMessageRenderSignature differs when streaming flag flips", () => {
  const node = { id: "n2", role: "assistant", parentId: null, versions: [{ id: "v", content: "" }], activeVersionId: "v" };
  const baseDeps = {
    getAssistantVersion: (n) => n.versions.find((v) => v.id === n.activeVersionId),
    getNode: () => null,
  };
  const idle = getMessageRenderSignature(node, { ...baseDeps, isStreamingNodeId: () => false });
  const live = getMessageRenderSignature(node, { ...baseDeps, isStreamingNodeId: (id) => id === "n2" });
  assert.notEqual(idle, live);
});

test("getMessageRenderSignature returns empty for null node or missing deps", () => {
  assert.equal(getMessageRenderSignature(null, {}), "");
  assert.equal(getMessageRenderSignature({}, null), "");
});

import { chatAttachmentLabel } from "../src/app/runtime/message-signature.js";

test("chatAttachmentLabel returns '' for empty list", () => {
  assert.equal(chatAttachmentLabel([]), "");
  assert.equal(chatAttachmentLabel(null), "");
});

test("chatAttachmentLabel reports image + file counts in CN format", () => {
  const items = [
    { name: "a.png", dataUrl: "data:..." },
    { name: "b.png", dataUrl: "data:..." },
    { name: "c.md", textExcerpt: "hello" },
  ];
  assert.equal(chatAttachmentLabel(items), "[2 张图片，1 个文件]");
});

test("chatAttachmentLabel suppresses zeros", () => {
  const justImages = [{ name: "x.png", dataUrl: "data:.." }];
  assert.equal(chatAttachmentLabel(justImages), "[1 张图片]");
  const justFiles = [{ name: "n.md", textExcerpt: "hi" }];
  assert.equal(chatAttachmentLabel(justFiles), "[1 个文件]");
});

test("chatAttachmentLabel respects the limit option", () => {
  const items = [
    { name: "a.png", dataUrl: "x" },
    { name: "b.png", dataUrl: "x" },
    { name: "c.png", dataUrl: "x" },
    { name: "d.png", dataUrl: "x" },
  ];
  assert.equal(chatAttachmentLabel(items, { limit: 2 }), "[2 张图片]");
});
