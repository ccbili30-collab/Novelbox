import { clean } from "../../utils/text.js";
import { getRoundAssistantAliases, normalizeMentionName } from "./roundtable-model.js";

export function findMentionedRoundtableAssistants(text, assistants, options = {}) {
  const source = clean(text);
  if (!source.includes("@")) return [];
  const normalized = clean(source)
    .replace(/\s+/g, "")
    .toLowerCase();
  const excludeIds = options.excludeIds instanceof Set ? options.excludeIds : new Set(options.excludeIds || []);
  const allowWriter = options.allowWriter !== false;
  return assistants
    .map((assistant) => {
      if ((!allowWriter && assistant.id === "writer") || excludeIds.has(assistant.id)) return null;
      const aliases = Array.isArray(assistant.aliases)
        ? assistant.aliases
        : getRoundAssistantAliases(assistant, assistant.base || assistant);
      const index = aliases.reduce((best, alias) => {
        const current = normalized.indexOf(`@${alias}`);
        if (current < 0) return best;
        return best < 0 ? current : Math.min(best, current);
      }, -1);
      if (index < 0) return null;
      return { assistant, index };
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index)
    .map(({ assistant }) => assistant);
}

export function moveMentionedAssistantsAfter(progress, currentIndex, assistants) {
  if (!progress?.ids?.length) return [];
  const ids = progress.ids;
  const currentSpeakerId = ids[currentIndex];
  const moved = [];
  const queued = new Set();
  let insertAt = currentIndex + 1;
  assistants.forEach((assistant) => {
    if (assistant.id === currentSpeakerId || queued.has(assistant.id)) return;
    queued.add(assistant.id);
    const from = ids.indexOf(assistant.id);
    if (from > currentIndex) {
      const [id] = ids.splice(from, 1);
      ids.splice(insertAt, 0, id);
    } else {
      ids.splice(insertAt, 0, assistant.id);
    }
    insertAt += 1;
    moved.push(assistant);
  });
  return moved;
}

export function createRoundProgress(selectedIds, topic = "") {
  return {
    ids: Array.isArray(selectedIds) ? [...selectedIds] : [],
    nextIndex: 0,
    topic: clean(topic),
    updatedAt: Date.now(),
  };
}

export function getRoundtableRoleState(selectedIds, assistantId) {
  if (!assistantId || assistantId === "writer") return "";
  const ids = Array.isArray(selectedIds) ? selectedIds.filter(Boolean) : [];
  const index = ids.indexOf(assistantId);
  if (index < 0) return "";
  return index === 0 ? "creator" : "participant";
}

export function getRoundtableRoleLabel(roleState, fallbackRole = "议员") {
  if (roleState === "creator") return "临时主创";
  if (roleState === "participant") return "参会议员";
  return clean(fallbackRole) || "议员";
}

export function buildRoundProgressInstruction(topic) {
  const cleanTopic = clean(topic);
  return cleanTopic
    ? `请围绕本轮主题发表意见：${cleanTopic}`
    : "请根据当前圆桌讨论发表你的聊天意见。默认先聊天讨论，除非用户明确要求，否则不要直接写成长篇成稿。";
}
