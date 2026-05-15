/**
 * Pure render-string helpers extracted from main.js.
 *
 * Each helper produces an HTML string given (mostly) primitive
 * inputs. They have no DOM, no module globals, no IO — so they are
 * directly testable.
 *
 * cssEscape(value)
 *   Mirror of CSS.escape with a regex fallback for environments
 *   that lack the global.
 *
 * renderChatContent(node, content, isStreamingThisNode, deps)
 *   Builds the inner-bubble HTML for a chat node. deps must supply
 *   { renderAssistantMarkdown, escapeHtml }.
 *
 * renderBranchSwitcher(node, deps)
 *   Builds the M3 switcher pill that lets users walk between
 *   sibling branches under a parent. deps must supply { getNode }.
 *
 * renderVersionSwitcher(node)
 *   Builds the M3 switcher pill that lets users flip between
 *   versions of a single assistant response.
 */

export function cssEscape(value) {
  if (typeof globalThis !== "undefined" && globalThis.CSS && typeof globalThis.CSS.escape === "function") {
    return globalThis.CSS.escape(String(value));
  }
  return String(value).replace(/["\\]/g, "\\$&");
}

export function renderChatContent(node, content, isStreamingThisNode, { renderAssistantMarkdown, escapeHtml }) {
  if (!content && !isStreamingThisNode) return "";
  if (node && node.role === "assistant") {
    return `<div class="message-content message-markdown">${renderAssistantMarkdown(content)}</div>`;
  }
  return `<span class="message-content">${escapeHtml(content)}</span>`;
}

export function renderBranchSwitcher(node, { getNode }) {
  if (!node) return "";
  const parent = getNode(node.parentId);
  if (!parent || parent.children.length < 2) return "";
  const index = parent.children.indexOf(node.id) + 1;
  return `<div class="switcher switcher--branch" role="group" aria-label="分支切换">
    <button type="button" class="switcher__btn" data-command="prev-branch" data-node-id="${node.id}" aria-label="上一分支"><span class="md-icon md-icon--sz-20" aria-hidden="true">chevron_left</span></button>
    <span class="switcher__index">${index}/${parent.children.length}</span>
    <button type="button" class="switcher__btn" data-command="next-branch" data-node-id="${node.id}" aria-label="下一分支"><span class="md-icon md-icon--sz-20" aria-hidden="true">chevron_right</span></button>
  </div>`;
}

/**
 * Build the meta line shown under an assistant bubble:
 *   "<n>字 · <time>[ · <K> tok]"
 *
 * Pure: deps must supply { formatTime, formatK }.
 */
export function buildMessageMeta(node, deps) {
  if (!node || !deps) return "";
  const { formatTime, formatK } = deps;
  const content = node._renderedContent ?? "";
  const versionUsage = node._renderedVersionUsage ?? 0;
  const usage = versionUsage ? ` · ${formatK(versionUsage)} tok` : "";
  return `${String(content).length}字 · ${formatTime(node._renderedTimestamp)}${usage}`;
}

/**
 * Decide whether a chat row should carry the "failed" CSS marker.
 * Any assistant content starting with "请求失败:" or "请求失败：" is
 * considered a failure marker the renderer can highlight in error
 * tones.
 */
export function isFailedAssistantContent(node, content) {
  if (!node || node.role !== "assistant") return false;
  return /^请求失败[:：]/.test(String(content || "").trim());
}

/** The 3-dot loading indicator used while a stream has produced no
 *  characters yet. Returned as a single HTML string. */
export const LOADING_DOTS_HTML =
  '<span class="message-content message-loading-dots" aria-label="正在生成"><i></i><i></i><i></i></span>';

/** The blinking caret while a stream is actively appending. */
export const STREAM_CARET_HTML = '<span class="stream-caret"></span>';

export function renderVersionSwitcher(node) {
  if (!node || node.role !== "assistant" || !Array.isArray(node.versions) || node.versions.length < 2) return "";
  const versionIndex = Math.max(0, node.versions.findIndex((item) => item.id === node.activeVersionId)) + 1;
  const onlyOne = node.versions.length < 2;
  const dis = onlyOne ? "disabled" : "";
  return `<div class="switcher" role="group" aria-label="版本切换">
    <button type="button" class="switcher__btn" data-command="prev-version" data-node-id="${node.id}" ${dis} aria-label="上一版本"><span class="md-icon md-icon--sz-20" aria-hidden="true">chevron_left</span></button>
    <span class="switcher__index">${versionIndex}/${node.versions.length}</span>
    <button type="button" class="switcher__btn" data-command="next-version" data-node-id="${node.id}" ${dis} aria-label="下一版本"><span class="md-icon md-icon--sz-20" aria-hidden="true">chevron_right</span></button>
  </div>`;
}
