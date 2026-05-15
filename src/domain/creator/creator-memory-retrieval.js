import { clean } from "../../utils/text.js";
import { getActiveCreatorMemoryEntries } from "./creator-memory-model.js";

export function memoryQueryLooksNeeded(text = "") {
  const source = clean(text);
  if (!source) return false;
  return /记得|记忆|以前|之前|上次|刚才|延续|继续|接着|参会|圆桌|在哪|说过|提过|忘|回忆|历史|旧会话|原会话|设定|偏好|文风|风格|伏笔/.test(source);
}

export function memoryQueryTokens(text = "") {
  const source = clean(text).toLowerCase();
  const tokens = new Set();
  (source.match(/[a-z0-9_\-]{2,}/g) || []).forEach((token) => tokens.add(token));
  (source.match(/[\u4e00-\u9fff]{2,}/g) || []).forEach((segment) => {
    if (segment.length <= 12) tokens.add(segment);
    for (let index = 0; index < Math.min(segment.length - 1, 24); index += 1) {
      tokens.add(segment.slice(index, index + 2));
    }
  });
  return Array.from(tokens).slice(0, 64);
}

export function scoreMemoryText(text = "", tokens = [], options = {}) {
  const source = clean(text).toLowerCase();
  if (!source) return 0;
  let score = 0;
  tokens.forEach((token) => {
    if (token && source.includes(token)) score += Math.min(8, token.length);
  });
  if (options.sessionId && source.includes(clean(options.sessionId).toLowerCase())) score += 2;
  return score;
}

export function retrieveCreatorMemories(memory = {}, query = "", options = {}) {
  const includeRecent = Boolean(options.includeRecent);
  if (!includeRecent && !memoryQueryLooksNeeded(query)) return [];
  const limit = Math.max(1, Number(options.limit) || 8);
  const tokens = memoryQueryTokens(query);
  const now = Number(options.now) || Date.now();
  const currentSessionId = clean(options.sessionId);
  const currentRoundtableId = clean(options.roundtableId);
  const isActiveMemory = typeof options.isActiveMemory === "function" ? options.isActiveMemory : () => true;
  return getActiveCreatorMemoryEntries(memory)
    .filter((entry) => isActiveMemory(entry))
    .map((entry) => {
      const recency = entry.createdAt ? (now - entry.createdAt < 7 * 86400000 ? 4 : 1) : 0;
      const sameSession = currentSessionId && entry.sourceSessionId === currentSessionId ? 3 : 0;
      const sameRoundtable = currentRoundtableId && entry.sourceRoundtableId === currentRoundtableId ? 3 : 0;
      const importance = Math.min(5, Number(entry.importance) || 0);
      const keywordScore = scoreMemoryText([entry.text, ...(entry.keywords || [])].join(" "), tokens, { sessionId: currentSessionId });
      return {
        ...entry,
        score: keywordScore + recency + sameSession + sameRoundtable + importance,
      };
    })
    .filter((entry) => includeRecent || entry.score > 0)
    .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
    .slice(0, limit);
}
