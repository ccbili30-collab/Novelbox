/**
 * Message render signature.
 *
 * The legacy renderMessages() avoided rebuilding chat rows by hashing
 * a signature string per node and reusing the existing DOM when the
 * signature matched. This module turns the signature builder into a
 * pure helper so it's:
 *   - testable without a DOM
 *   - reusable from other surfaces (e.g. the eventual virtualised list)
 *   - independent from the imperative streaming flag
 *
 * The streaming flag is passed in instead of read from a module
 * global, so callers from a refactored controller can hint that the
 * node is currently being streamed.
 */

import { clean } from "../../utils/text.js";
import { uid } from "../../utils/id.js";

export function getMessageContent(node, getAssistantVersion) {
  if (!node) return "";
  if (node.role === "assistant") return getAssistantVersion(node)?.content || "";
  return node.content || "";
}

export function normalizeChatAttachments(attachments = [], { limit = 6, textLimit = 12000 } = {}) {
  return (Array.isArray(attachments) ? attachments : [])
    .filter((item) => item?.dataUrl || clean(item?.textExcerpt) || clean(item?.name))
    .slice(0, limit)
    .map((item) => ({
      id: item.id || uid("att"),
      kind: clean(item.kind) || (item.dataUrl ? "image" : clean(item.textExcerpt) ? "text" : "file"),
      name: clean(item.name) || (item.dataUrl ? "image" : "file"),
      type: clean(item.type),
      size: Number(item.size) || 0,
      dataUrl: clean(item.dataUrl),
      textExcerpt: clean(item.textExcerpt).slice(0, textLimit),
      readable: Boolean(item.readable || clean(item.textExcerpt)),
    }));
}

/**
 * Build a stable signature for a chat node so renderers can decide
 * whether to reuse the existing DOM row or rebuild it. Returned as a
 * single :: separated string so the caller can compare with === .
 *
 * deps: { getAssistantVersion, getNode, isStreamingNodeId(id) -> bool,
 *         attachmentLimit, textLimit }
 */
export function getMessageRenderSignature(node, deps) {
  if (!node || !deps) return "";
  const { getAssistantVersion, getNode, isStreamingNodeId,
          attachmentLimit, textLimit } = deps;
  const content = getMessageContent(node, getAssistantVersion);
  const version = getAssistantVersion(node);
  const parent = getNode(node.parentId);
  const attachments = normalizeChatAttachments(node.attachments, {
    limit: attachmentLimit, textLimit,
  });
  return [
    node.id,
    node.role,
    node.activeVersionId || "",
    node.versions?.length || 0,
    version?.createdAt || node.createdAt || 0,
    version?.usage?.total_tokens || 0,
    content,
    attachments.map((a) => `${a.id}:${a.name}:${a.dataUrl?.length || 0}`).join("|"),
    parent?.activeChildId || "",
    parent?.children?.length || 0,
    isStreamingNodeId?.(node.id) ? "streaming" : "",
  ].join("::");
}
