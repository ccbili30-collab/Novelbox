import { uid } from "../../utils/id.js";
import { clean } from "../../utils/text.js";

export const ROUNDTABLE_CONCISE_RULE = "默认只说1-3句，120字以内；只给最关键判断和一个可执行建议。不要写长段、不要列长清单、不要复述资料。只有用户或其他议员明确要求“展开/详细/深度思考”时，才可以放长。";
export const ROUNDTABLE_COUNCIL_CHAT_RULE = "圆桌默认以聊天讨论、判断、反驳、建议和协作为主。除非用户明确点名要求某位成员直接起草成稿，否则议员应像群聊参会者一样发言，不要擅自进入长篇创作或代写模式。";
export const DEFAULT_CUSTOM_ROUNDTABLE_ASSISTANT_PROMPT = `你是圆桌共创议员。请先理解当前讨论到底是在聊什么，再像群聊成员一样给出独立、具体、中文的意见。可以反驳其他成员，但要说明原因；除非被明确要求，不要擅自进入长篇创作。${ROUNDTABLE_COUNCIL_CHAT_RULE}${ROUNDTABLE_CONCISE_RULE}`;
export const GENERATIVE_AGENT_MEMORY_LIMIT = 24;

export const DEFAULT_ROUNDTABLE_SELECTED_IDS = ["setting", "review", "style", "plot"];
export const DEFAULT_ROUNDTABLE_PAPER_REVEAL = 0.1;

export const DEFAULT_ROUNDTABLE_CONTEXT = {
  includeManuscript: true,
  includeNovel: true,
  includePlotline: true,
  includeCharacters: true,
  includeWorld: true,
  includeOutline: true,
  includeForeshadows: true,
  includeMainChat: true,
  includeDiscussion: true,
  excerptMax: 520,
  discussionCount: 24,
  roundTopic: "",
};

export const ROUND_ASSISTANTS = [
  {
    id: "setting",
    name: "世界观塑造者",
    role: "议员",
    prompt: `你是世界观塑造者。你的偏好是从规则、背景、结构、边界和一致性的角度参与讨论，但不要把自己锁死成工具按钮。先理解当前主题；无论是在聊小说、文章、产品、哲学还是别的话题，都优先给出能帮助推进讨论的判断。${ROUNDTABLE_COUNCIL_CHAT_RULE}${ROUNDTABLE_CONCISE_RULE}`,
  },
  {
    id: "plot",
    name: "事件管理",
    role: "议员",
    prompt: `你是事件管理。你的偏好是从事件推进、因果关系、行动后果、冲突结构和决策路径的角度发言。先判断眼前讨论需要什么，再给出具体意见；不要默认把任何任务都理解成小说情节推进。${ROUNDTABLE_COUNCIL_CHAT_RULE}${ROUNDTABLE_CONCISE_RULE}`,
  },
  {
    id: "review",
    name: "角色管理",
    role: "议员",
    prompt: `你是角色管理。你的偏好是从人物动机、关系、情绪、行为可信度和立场变化的角度发言。当前主题如果不是小说角色，也可以把这种视角迁移到说话者、受众、利益相关者或观点冲突上。${ROUNDTABLE_COUNCIL_CHAT_RULE}${ROUNDTABLE_CONCISE_RULE}`,
  },
  {
    id: "style",
    name: "伏笔管理",
    role: "议员",
    prompt: `你是伏笔管理。你的偏好是关注铺垫、信息差、延迟揭示、回收与预期管理。当前主题如果不是小说，也可以把这理解成前置铺垫、表达节奏、悬念设计、信息释放顺序和长期呼应。${ROUNDTABLE_COUNCIL_CHAT_RULE}${ROUNDTABLE_CONCISE_RULE}`,
  },
  {
    id: "writer",
    name: "写手",
    role: "写手",
    prompt: "你是写手。你的职责是把用户真正想要的成品写出来。先判断当前任务是在聊天、讨论、总结，还是要正式产出；只有当用户明确要求创作或成稿时，你才进入写作模式，并按要求输出小说、文章、设定稿、发言稿、总结或其他合适文本。写手不受议员短评字数限制。",
  },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeRoundtableContextOptions(options = {}) {
  const source = options && typeof options === "object" ? options : {};
  const includeNovel = source.includeNovel !== false;
  return {
    includeManuscript: source.includeManuscript !== false,
    includeNovel,
    includePlotline: source.includePlotline ?? includeNovel,
    includeCharacters: source.includeCharacters ?? includeNovel,
    includeWorld: source.includeWorld ?? includeNovel,
    includeOutline: source.includeOutline ?? includeNovel,
    includeForeshadows: source.includeForeshadows ?? includeNovel,
    includeMainChat: source.includeMainChat !== false,
    includeDiscussion: source.includeDiscussion !== false,
    excerptMax: clamp(Number(source.excerptMax) || DEFAULT_ROUNDTABLE_CONTEXT.excerptMax, 120, 2400),
    discussionCount: clamp(Number(source.discussionCount) || DEFAULT_ROUNDTABLE_CONTEXT.discussionCount, 0, 80),
    roundTopic: clean(source.roundTopic || ""),
  };
}

export function normalizeCustomAssistant(item, index = 0) {
  if (!item || typeof item !== "object") return null;
  const id = clean(item.id) || uid("round_member");
  if (id === "writer" || ROUND_ASSISTANTS.some((assistant) => assistant.id === id)) return null;
  return {
    id,
    name: clean(item.name) || `新议员${index + 1}`,
    role: clean(item.role) || "议员",
    prompt: clean(item.prompt) || DEFAULT_CUSTOM_ROUNDTABLE_ASSISTANT_PROMPT,
  };
}

export function hydrateRoundtableState(roundtable = {}) {
  const rt = roundtable && typeof roundtable === "object" ? roundtable : {};
  rt.enabled = Boolean(rt.enabled);
  rt.membersOpen = Boolean(rt.membersOpen);
  rt.materialsOpen = Boolean(rt.materialsOpen);
  rt.contextOpen = Boolean(rt.contextOpen);
  rt.customAssistants = Array.isArray(rt.customAssistants)
    ? rt.customAssistants.map(normalizeCustomAssistant).filter(Boolean)
    : [];
  rt.hiddenAssistantIds = Array.isArray(rt.hiddenAssistantIds)
    ? rt.hiddenAssistantIds.filter((id) => id && id !== "writer")
    : [];
  rt.selectedIds = Array.isArray(rt.selectedIds) && rt.selectedIds.length
    ? rt.selectedIds.filter((id) => {
        const assistant = getRoundAssistantBaseFromState(id, rt);
        return assistant && assistant.id !== "writer";
      })
    : [...DEFAULT_ROUNDTABLE_SELECTED_IDS];
  rt.messages = Array.isArray(rt.messages) ? rt.messages : [];
  rt.assistantConfigs = rt.assistantConfigs && typeof rt.assistantConfigs === "object" ? rt.assistantConfigs : {};
  rt.roundProgress = rt.roundProgress && typeof rt.roundProgress === "object" ? rt.roundProgress : null;
  rt.contextOptions = normalizeRoundtableContextOptions(rt.contextOptions);
  rt.paperReveal = clamp(Number.isFinite(Number(rt.paperReveal)) ? Number(rt.paperReveal) : DEFAULT_ROUNDTABLE_PAPER_REVEAL, 0, 1);
  rt.paperScrollTop = Math.max(0, Number(rt.paperScrollTop) || 0);
  rt.paperAtBottom = rt.paperAtBottom !== false;
  rt.paperTextLength = Math.max(0, Number(rt.paperTextLength) || 0);
  rt.paperHasNewProse = Boolean(rt.paperHasNewProse);
  return rt;
}

export function getRoundAssistantBasesFromState(roundtable = {}) {
  const hidden = new Set(Array.isArray(roundtable.hiddenAssistantIds) ? roundtable.hiddenAssistantIds : []);
  const custom = Array.isArray(roundtable.customAssistants)
    ? roundtable.customAssistants.map(normalizeCustomAssistant).filter(Boolean)
    : [];
  return [...ROUND_ASSISTANTS, ...custom].filter((assistant) => !hidden.has(assistant.id));
}

export function getRoundAssistantBaseFromState(id, roundtable = {}) {
  return getRoundAssistantBasesFromState(roundtable).find((assistant) => assistant.id === id) || null;
}

export function isCustomRoundAssistantInState(id, roundtable = {}) {
  return Array.isArray(roundtable.customAssistants)
    && roundtable.customAssistants.some((assistant) => assistant?.id === id);
}

export function resolveRoundAssistant(input) {
  const base = input.base;
  if (!base) return null;
  const config = input.config || {};
  const defaults = input.api || {};
  const session = input.sessionSettings || {};
  const contextOptions = normalizeRoundtableContextOptions({
    ...(input.roundtableContextOptions || {}),
    ...(config.contextOptions || {}),
  });
  return {
    ...base,
    ...config,
    id: base.id,
    role: base.role,
    name: clean(config.name) || base.name,
    prompt: clean(config.prompt) || base.prompt,
    providerId: clean(config.providerId),
    apiBaseUrl: clean(config.apiBaseUrl) || clean(defaults.baseUrl),
    apiKey: clean(config.apiKey) || clean(defaults.apiKey),
    model: clean(config.model) || clean(session.model),
    networkEnabled: Boolean(config.networkEnabled),
    maxTokens: Number(config.maxTokens) || 0,
    temperature: Number.isFinite(Number(config.temperature)) ? Number(config.temperature) : session.temperature,
    contextOptions,
    activationProfile: clean(config.activationProfile),
    memories: normalizeAssistantMemories(config.memories),
    avatarDataUrl: clean(config.avatarDataUrl),
    inheritedApiBaseUrl: !clean(config.apiBaseUrl),
    inheritedApiKey: !clean(config.apiKey),
    inheritedModel: !clean(config.model),
  };
}

export function createRoundAssistantConfigView(assistant, fallbackTemperature) {
  if (!assistant) return null;
  return {
    name: assistant.name,
    prompt: assistant.prompt,
    providerId: assistant.providerId || "",
    apiBaseUrl: assistant.inheritedApiBaseUrl ? "" : assistant.apiBaseUrl || "",
    apiKey: assistant.inheritedApiKey ? "" : assistant.apiKey || "",
    model: assistant.inheritedModel ? "" : assistant.model || "",
    networkEnabled: Boolean(assistant.networkEnabled),
    maxTokens: Number(assistant.maxTokens) || 0,
    temperature: Number.isFinite(Number(assistant.temperature)) ? Number(assistant.temperature) : fallbackTemperature,
    contextOptions: assistant.contextOptions || normalizeRoundtableContextOptions(),
    activationProfile: assistant.activationProfile || "",
    memories: normalizeAssistantMemories(assistant.memories),
    avatarDataUrl: assistant.avatarDataUrl || "",
    inheritedApiBaseUrl: Boolean(assistant.inheritedApiBaseUrl),
    inheritedApiKey: Boolean(assistant.inheritedApiKey),
    inheritedModel: Boolean(assistant.inheritedModel),
  };
}

export function normalizeMentionName(value) {
  return clean(value)
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function getRoundAssistantAliases(assistant, base = assistant) {
  const names = new Set([
    assistant.id,
    assistant.name,
    base.name,
  ]);
  if (assistant.id === "setting") ["世界观塑造者", "世界观", "设定师", "设定"].forEach((name) => names.add(name));
  if (assistant.id === "plot") ["事件管理", "剧情", "剧情师", "编剧", "剧情大手"].forEach((name) => names.add(name));
  if (assistant.id === "review") ["角色管理", "角色", "人物", "心理", "审稿", "审稿人", "审核", "编辑"].forEach((name) => names.add(name));
  if (assistant.id === "style") ["伏笔管理", "伏笔", "悬念", "文风", "文风师", "润色", "风格"].forEach((name) => names.add(name));
  if (assistant.id === "writer") ["写手", "writer", "作者", "正文"].forEach((name) => names.add(name));
  return [...names].map(normalizeMentionName).filter(Boolean);
}

export function normalizeAssistantMemories(memories = []) {
  return Array.isArray(memories)
    ? memories
      .filter((item) => item && typeof item === "object" && clean(item.text))
      .map((item) => ({
        id: clean(item.id) || uid("memory"),
        text: clean(item.text),
        createdAt: Number(item.createdAt) || Date.now(),
        source: clean(item.source || "roundtable"),
      }))
      .slice(-GENERATIVE_AGENT_MEMORY_LIMIT)
    : [];
}
