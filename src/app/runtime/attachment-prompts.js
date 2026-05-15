/**
 * Attachment-prompt builders.
 *
 * Pure helpers that turn a normalised attachment list into the
 * prompt-side text fragments we send to the model:
 *
 *   buildChatAttachmentPrompt  →  "【用户本轮附件】\n1. notes.md…"
 *   buildChatImagePrompt        →  "【用户本轮图片】\n1. cat.png…"
 *   buildUserTextWithAttachments→  Combined text+files+images block.
 *   formatBytes(bytes)         →  Human-readable size string.
 *
 * deps: { normalizeChatAttachments, clean }.
 */

export function formatBytes(bytes) {
  const size = Number(bytes) || 0;
  if (size >= 1024 * 1024) return `${Math.round(size / 1024 / 102.4) / 10} MB`;
  if (size >= 1024)        return `${Math.round(size / 102.4) / 10} KB`;
  return `${size} B`;
}

function fileLine(file, index) {
  const title = `${index + 1}. ${file.name}${file.size ? `（${formatBytes(file.size)}）` : ""}`;
  if (file.textExcerpt) return `${title}\n${file.textExcerpt}`;
  return `${title}\n（此文件已附加为索引，但当前版本暂未读取全文；请使用 TXT/MD/JSON/CSV/YAML/LOG 这类基础文本文件。）`;
}

export function buildChatAttachmentPrompt(attachments, { normalizeChatAttachments, opts = {} } = {}) {
  if (typeof normalizeChatAttachments !== "function") return "";
  const files = normalizeChatAttachments(attachments, opts).filter((i) => i.kind !== "image");
  if (!files.length) return "";
  return ["【用户本轮附件】", ...files.map(fileLine)].join("\n\n");
}

export function buildChatImagePrompt(attachments, { normalizeChatAttachments, opts = {} } = {}) {
  if (typeof normalizeChatAttachments !== "function") return "";
  const images = normalizeChatAttachments(attachments, opts).filter((i) => i.kind === "image");
  if (!images.length) return "";
  return `【用户本轮图片】\n${images.map((image, index) =>
    `${index + 1}. ${image.name}${image.size ? `（${formatBytes(image.size)}）` : ""}`
  ).join("\n")}`;
}

export function buildUserTextWithAttachments(text, attachments, deps = {}) {
  const { clean = (s) => String(s ?? "").trim() } = deps;
  return [
    clean(text),
    buildChatAttachmentPrompt(attachments, deps),
    buildChatImagePrompt(attachments, deps),
  ].filter(Boolean).join("\n\n");
}
