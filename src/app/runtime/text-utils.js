/**
 * Small pure text utilities lifted out of main.js so they can be
 * unit-tested without a DOM.
 *
 *   simpleHash(text)
 *     Stable FNV-1a 32-bit hash returned as a base-10 string.
 *     Used to fingerprint roundtable speech so renders can detect
 *     "same speech, different rendering pass".
 *
 *   replaceMentionsWithHtml(source, mentionMap, renderHit, escapeHtml)
 *     Walks @mention tokens (CJK + ASCII alphanumerics + underscore +
 *     hyphen) inside `source`, replaces each one with the markup
 *     returned by `renderHit({raw, alias, target})`. Unknown aliases
 *     are emitted as a generic markup string from
 *     `renderHit({ raw, alias, target: null })`.
 */

export function simpleHash(text) {
  const source = String(text ?? "");
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return String(hash >>> 0);
}

const MENTION_RE = /@([A-Za-z0-9_\-一-鿿]+)/g;

export function replaceMentionsWithHtml({
  source,
  resolveTarget,
  renderHit,
  escapeHtml,
  normalizeAlias = (s) => String(s).trim().toLowerCase(),
}) {
  if (!source) return "";
  let html = "";
  let lastIndex = 0;
  let match;
  // Reset RE state between calls — sticky shared regex.
  MENTION_RE.lastIndex = 0;
  while ((match = MENTION_RE.exec(source))) {
    html += escapeHtml(source.slice(lastIndex, match.index));
    const raw = match[0];
    const alias = normalizeAlias(match[1]);
    const target = resolveTarget(alias);
    html += renderHit({ raw, alias, target, escapeHtml });
    lastIndex = match.index + raw.length;
  }
  html += escapeHtml(source.slice(lastIndex));
  return html;
}
