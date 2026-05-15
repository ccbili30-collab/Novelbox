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
