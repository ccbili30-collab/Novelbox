/**
 * Roundtable view-layer helpers.
 *
 * The full renderRoundtable family in main.js still reaches into a
 * dozen module-level flags (roundtableActiveSpeakerId, mentionPickerOpen,
 * isGenerating, generatingNodeId, etc.) so a wholesale move would
 * require shipping all those state hooks too. This module starts with
 * the pure pieces — the decision + mention badges, the empty-state
 * placeholder, the date divider builder — so they're independently
 * unit-testable and reusable from a future v2 component tree.
 */

import { escapeHtml } from "../../utils/text.js";
import { formatTime } from "../../utils/time.js";

/**
 * Pull the dateKey used to decide whether two consecutive roundtable
 * messages need a divider between them. Same algorithm as the legacy
 * `roundtableDateKey` used by the imperative renderer.
 */
export function roundtableDateKey(value) {
  const d = new Date(value || Date.now());
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * "Empty" state for the roundtable discussion stream. Today the
 * legacy renderer returns "" — but the v2 redesign will show a M3
 * empty state, so the indirection lives here.
 */
export function renderRoundtableEmpty() {
  return "";
}

/**
 * Build the small "已采纳 / 已忽略 / 通过 / 需修改" pill that hangs
 * off a roundtable message after a user decision.
 */
export function renderRoundtableDecisionBadge(message) {
  if (!message) return "";
  const status = message.decisionStatus;
  if (status === "adopted") return `<span class="roundtable-decision adopted">已采纳</span>`;
  if (status === "ignored") return `<span class="roundtable-decision ignored">已忽略</span>`;
  if (status === "approved") return `<span class="roundtable-decision approved">通过</span>`;
  if (status === "revision") return `<span class="roundtable-decision revision">需修改</span>`;
  return "";
}

/**
 * Build the "回应 @<name>" badge that decorates messages produced as
 * a reply to a mention. Returns "" when no mention metadata is set.
 */
export function renderRoundtableMentionBadge(message) {
  if (!message?.mentionMeta?.triggeredByName) return "";
  return `<span class="roundtable-mention-badge">回应 @${escapeHtml(message.mentionMeta.triggeredByName)}</span>`;
}

/**
 * Build a date-divider HTML chip the imperative discussion renderer
 * inserts between groups of messages from different hours / days.
 */
export function renderRoundtableDateDivider(message) {
  if (!message?.createdAt) return "";
  return `<div class="roundtable-divider"><span>${escapeHtml(formatTime(message.createdAt))}</span></div>`;
}

/**
 * Walk a list of roundtable messages and return the inserted dividers
 * + speech rows as one HTML string. The per-message renderer is
 * injected so the still-coupled renderRoundtableMessage can stay in
 * main.js for now.
 *
 *   buildRoundtableDiscussion(messages, { renderMessage })
 */
export function buildRoundtableDiscussion(messages, { renderMessage }) {
  if (!Array.isArray(messages) || !messages.length) return renderRoundtableEmpty();
  let lastKey = "";
  return messages.map((message, index) => {
    const key = roundtableDateKey(message.createdAt);
    const divider = index === 0 || key !== lastKey ? renderRoundtableDateDivider(message) : "";
    lastKey = key;
    return `${divider}${renderMessage(message)}`;
  }).join("");
}
