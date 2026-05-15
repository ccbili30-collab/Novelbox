import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatBytes,
  buildChatAttachmentPrompt,
  buildChatImagePrompt,
  buildUserTextWithAttachments,
} from "../src/app/runtime/attachment-prompts.js";
import { normalizeChatAttachments } from "../src/app/runtime/message-signature.js";

test("formatBytes renders B / KB / MB tiers", () => {
  // The legacy formula is round(bytes/102.4)/10 → 1 KB for exactly 1024 B.
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(1024 * 1024), "1 MB");
});

test("formatBytes coerces non-numbers to 0", () => {
  assert.equal(formatBytes(undefined), "0 B");
  assert.equal(formatBytes("nope"), "0 B");
  assert.equal(formatBytes(null), "0 B");
});

test("buildChatAttachmentPrompt skips images, lists files with sizes", () => {
  const prompt = buildChatAttachmentPrompt(
    [
      { name: "skip.png", dataUrl: "x", size: 100 },
      { name: "notes.md", textExcerpt: "first line", size: 200 },
      { name: "data.json", textExcerpt: "{}",        size: 1024 },
    ],
    { normalizeChatAttachments }
  );
  assert.match(prompt, /【用户本轮附件】/);
  assert.match(prompt, /1\. notes\.md/);
  assert.match(prompt, /2\. data\.json/);
  assert.doesNotMatch(prompt, /skip\.png/);
});

test("buildChatAttachmentPrompt warns on files without textExcerpt", () => {
  const prompt = buildChatAttachmentPrompt(
    [{ name: "binary.dat", size: 100 }],
    { normalizeChatAttachments }
  );
  assert.match(prompt, /暂未读取全文/);
});

test("buildChatImagePrompt lists images and skips files", () => {
  const prompt = buildChatImagePrompt(
    [
      { name: "cat.png", dataUrl: "x", size: 100 },
      { name: "dog.png", dataUrl: "x", size: 200 },
      { name: "skip.md", textExcerpt: "no" },
    ],
    { normalizeChatAttachments }
  );
  assert.match(prompt, /【用户本轮图片】/);
  assert.match(prompt, /1\. cat\.png/);
  assert.match(prompt, /2\. dog\.png/);
  assert.doesNotMatch(prompt, /skip\.md/);
});

test("buildUserTextWithAttachments concatenates with double newlines", () => {
  const out = buildUserTextWithAttachments(
    "  hello  ",
    [
      { name: "n.md", textExcerpt: "x" },
      { name: "i.png", dataUrl: "x" },
    ],
    { normalizeChatAttachments }
  );
  // text + files block + images block, joined by '\n\n'
  const blocks = out.split("\n\n");
  assert.equal(blocks[0], "hello");
  assert.ok(blocks.some((b) => b.startsWith("【用户本轮附件】")));
  assert.ok(blocks.some((b) => b.startsWith("【用户本轮图片】")));
});

test("buildUserTextWithAttachments returns just the text when no attachments", () => {
  const out = buildUserTextWithAttachments("just text", [], { normalizeChatAttachments });
  assert.equal(out, "just text");
});

test("builders without normalizeChatAttachments dep return ''", () => {
  assert.equal(buildChatAttachmentPrompt([{ name: "x" }]), "");
  assert.equal(buildChatImagePrompt([{ name: "x", dataUrl: "y" }]), "");
});
