import { clean } from "../../utils/text.js";
import { createCreatorMemoryEntry } from "./creator-memory-model.js";

const REMEMBER_PATTERN = /(记住|记一下|以后|从现在|设定|规则|偏好|喜欢|不喜欢|不要|别|总是|必须|决定|采用|确认|伏笔|角色|世界观|文风|风格|口吻|我希望|我要求)/i;
const EXPLICIT_MEMORY_PATTERN = /(记住|记一下|以后|从现在开始)/i;

function inferMemoryType(text) {
  if (/(文风|风格|口吻|语气|短句|长句|画风)/i.test(text)) return "style";
  if (/(设定|世界观|角色|人物|伏笔|剧情|大纲|规则)/i.test(text)) return "setting";
  if (/(决定|采用|确认|定为|就这样)/i.test(text)) return "decision";
  if (/(不要|别|禁止|避免|雷点|不喜欢)/i.test(text)) return "warning";
  if (/(喜欢|偏好|希望|要求)/i.test(text)) return "preference";
  return "summary";
}

function inferKeywords(text) {
  return Array.from(new Set(clean(text)
    .split(/[\s,，。！？、;；:："'“”‘’()[\]【】<>《》]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 12)));
}

export function shouldRememberMessage(input = {}) {
  const text = clean(input.content);
  if (!text || input.speakerId === "writer") return false;
  if (input.force) return true;
  if (input.role === "assistant" && !input.durable) return false;
  return REMEMBER_PATTERN.test(text);
}

export function createMemoryEntriesFromMessage(input = {}) {
  const text = clean(input.content);
  if (!shouldRememberMessage(input)) return [];
  const explicit = EXPLICIT_MEMORY_PATTERN.test(text);
  const now = Number(input.createdAt) || Date.now();
  return [createCreatorMemoryEntry({
    id: clean(input.id) || (input.sourceNodeId ? `memory_${input.sourceNodeId}` : ""),
    creatorId: input.creatorId,
    scope: input.scope || "session",
    sourceSessionId: input.sourceSessionId,
    sourceRoundtableId: input.sourceRoundtableId,
    sourceNodeId: input.sourceNodeId,
    sourceRecordId: input.sourceRecordId,
    branchPathHash: input.branchPathHash,
    type: input.type || inferMemoryType(text),
    text: text.length > 520 ? text.slice(0, 520) : text,
    keywords: input.keywords || inferKeywords(text),
    importance: explicit ? 7 : Number(input.importance) || 3,
    createdAt: now,
    updatedAt: now,
  })];
}
