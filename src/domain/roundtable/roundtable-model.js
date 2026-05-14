import { uid } from "../../utils/id.js";
import { clean } from "../../utils/text.js";
import { SEALED_B_PROMPT, SEALED_T_PROMPT } from "./sealed-prompts.js";

export const ROUNDTABLE_CONCISE_RULE = "默认只说1-2句，80字以内；只给最关键判断和一个可执行建议。不要写长段、不要列长清单、不要复述资料。只有用户或其他议员明确要求“展开/详细/深度思考”时，才可以放长。";
export const ROUNDTABLE_COUNCIL_CHAT_RULE = "圆桌默认以聊天讨论、判断、反驳、建议和协作为主。除非用户明确点名要求某位成员直接起草成稿，否则议员应像群聊参会者一样发言，不要擅自进入长篇创作或代写模式。";
export const AI_TRAIT_WORDS = [
  "好奇",
  "敏锐",
  "温柔",
  "勇敢",
  "耐心",
  "诚实",
  "浪漫",
  "抽象",
  "安静",
  "戏剧化",
  "冷静",
  "锋利",
  "顽皮",
  "固执",
  "急躁",
  "多疑",
  "虚荣",
  "苦涩",
  "焦虑",
  "鲁莽",
  "犬儒",
];

export function createTraitPrompt(trait) {
  return `你是一个${clean(trait) || "好奇"}的 AI。`;
}

export function createRandomTraitPrompt() {
  return createTraitPrompt(AI_TRAIT_WORDS[Math.floor(Math.random() * AI_TRAIT_WORDS.length)]);
}

function isLegacyDefaultPrompt(prompt) {
  const value = clean(prompt);
  return !value
    || value.includes("你是一个有主见的 AI")
    || value.includes(ROUNDTABLE_COUNCIL_CHAT_RULE)
    || value.includes(ROUNDTABLE_CONCISE_RULE);
}

export const OPINIONATED_AI_PROMPT = createRandomTraitPrompt();
export const DEFAULT_CUSTOM_ROUNDTABLE_ASSISTANT_PROMPT = OPINIONATED_AI_PROMPT;
export const GENERATIVE_AGENT_MEMORY_LIMIT = 24;

export const DEFAULT_ROUNDTABLE_SELECTED_IDS = [];
export const DEFAULT_HIDDEN_ROUNDTABLE_ASSISTANT_IDS = ["setting", "review", "skeptic", "style"];
export const DEFAULT_ROUNDTABLE_PAPER_REVEAL = 0.1;

export const SEALED_ROUNDTABLE_CREATORS = [
  {
    id: "sealed-t",
    name: "T",
    role: "sealed-creator",
    prompt: SEALED_T_PROMPT,
    avatarUrl: "./src/assets/sealed-t.ico",
  },
  {
    id: "sealed-b",
    name: "B",
    role: "sealed-creator",
    prompt: SEALED_B_PROMPT,
    avatarUrl: "./src/assets/sealed-b.png",
  },
];

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
    name: "规则型主创",
    role: "议员",
    prompt: OPINIONATED_AI_PROMPT,
  },
  {
    id: "plot",
    name: "主创",
    role: "议员",
    prompt: OPINIONATED_AI_PROMPT,
  },
  {
    id: "review",
    name: "人物型主创",
    role: "议员",
    prompt: OPINIONATED_AI_PROMPT,
  },
  {
    id: "skeptic",
    name: "怀疑型主创",
    role: "议员",
    prompt: OPINIONATED_AI_PROMPT,
  },
  {
    id: "style",
    name: "表达型主创",
    role: "议员",
    prompt: OPINIONATED_AI_PROMPT,
  },
  {
    id: "writer",
    name: "写手",
    role: "写手",
    prompt: "你是写手，一个独立的文本规范 AI。你的职责是读取用户和主创/议员已经形成的有效内容，并把它们同步落成小说、文章、设定稿、发言稿、会议总结、方案或其他合适文本。你不是议员，不负责提出主要立场或参与争论；你只负责把主创记忆、圆桌意见和用户指令转化为可用成品。写手不受议员短评字数限制，但输出必须直接、规范、可用、少废话。不要寒暄、不要解释过程、不要说“我可以为你”，除非用户要求讨论，否则直接给成品。",
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
    prompt: clean(item.prompt) || createRandomTraitPrompt(),
  };
}

export function hydrateRoundtableState(roundtable = {}) {
  const rt = roundtable && typeof roundtable === "object" ? roundtable : {};
  rt.enabled = Boolean(rt.enabled);
  rt.membersOpen = Boolean(rt.membersOpen);
  rt.materialsOpen = Boolean(rt.materialsOpen);
  rt.sessionImportOpen = Boolean(rt.sessionImportOpen);
  rt.contextOpen = Boolean(rt.contextOpen);
  rt.customAssistants = Array.isArray(rt.customAssistants)
    ? rt.customAssistants.map(normalizeCustomAssistant).filter(Boolean)
    : [];
  const hiddenAssistantIds = Array.isArray(rt.hiddenAssistantIds)
    ? rt.hiddenAssistantIds.filter((id) => id && id !== "writer")
    : [];
  rt.hiddenAssistantIds = Array.from(new Set([
    ...DEFAULT_HIDDEN_ROUNDTABLE_ASSISTANT_IDS,
    ...hiddenAssistantIds,
  ]));
  rt.selectedIds = Array.isArray(rt.selectedIds) && rt.selectedIds.length
    ? Array.from(new Set(rt.selectedIds
        .map((id) => clean(id))
        .filter((id) => id && id !== "writer" && id !== "plot" && !isSealedRoundtableCreatorId(id))))
    : [...DEFAULT_ROUNDTABLE_SELECTED_IDS];
  rt.primaryInRound = rt.primaryInRound !== false;
  rt.speakerOrderIds = Array.isArray(rt.speakerOrderIds)
    ? Array.from(new Set(rt.speakerOrderIds.map((id) => clean(id)).filter(Boolean)))
    : [];
  rt.messages = Array.isArray(rt.messages) ? rt.messages : [];
  rt.assistantConfigs = rt.assistantConfigs && typeof rt.assistantConfigs === "object" ? rt.assistantConfigs : {};
  ROUND_ASSISTANTS.forEach((assistant) => {
    if (assistant.id === "writer") return;
    const config = rt.assistantConfigs[assistant.id] && typeof rt.assistantConfigs[assistant.id] === "object"
      ? rt.assistantConfigs[assistant.id]
      : {};
    if (isLegacyDefaultPrompt(config.prompt)) {
      rt.assistantConfigs[assistant.id] = {
        ...config,
        prompt: createRandomTraitPrompt(),
      };
    }
  });
  rt.customAssistants.forEach((assistant) => {
    const config = rt.assistantConfigs[assistant.id] && typeof rt.assistantConfigs[assistant.id] === "object"
      ? rt.assistantConfigs[assistant.id]
      : {};
    if (isLegacyDefaultPrompt(config.prompt)) {
      rt.assistantConfigs[assistant.id] = {
        ...config,
        prompt: createRandomTraitPrompt(),
      };
    }
  });
  rt.roundProgress = rt.roundProgress && typeof rt.roundProgress === "object" ? rt.roundProgress : null;
  rt.contextOptions = normalizeRoundtableContextOptions(rt.contextOptions);
  rt.paperReveal = clamp(Number.isFinite(Number(rt.paperReveal)) ? Number(rt.paperReveal) : DEFAULT_ROUNDTABLE_PAPER_REVEAL, 0, 1);
  rt.paperScrollTop = Math.max(0, Number(rt.paperScrollTop) || 0);
  rt.paperAtBottom = rt.paperAtBottom !== false;
  rt.paperTextLength = Math.max(0, Number(rt.paperTextLength) || 0);
  rt.paperHasNewProse = Boolean(rt.paperHasNewProse);
  rt.sealedCreatorId = SEALED_ROUNDTABLE_CREATORS.some((creator) => creator.id === rt.sealedCreatorId)
    ? rt.sealedCreatorId
    : "";
  SEALED_ROUNDTABLE_CREATORS.forEach((creator) => {
    const config = rt.assistantConfigs[creator.id] && typeof rt.assistantConfigs[creator.id] === "object"
      ? rt.assistantConfigs[creator.id]
      : {};
    rt.assistantConfigs[creator.id] = {
      ...config,
      name: clean(config.name) || creator.name,
      prompt: creator.prompt,
      avatarDataUrl: clean(config.avatarDataUrl),
      sealed: true,
    };
  });
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
  return getRoundAssistantBasesFromState(roundtable).find((assistant) => assistant.id === id)
    || SEALED_ROUNDTABLE_CREATORS.find((assistant) => assistant.id === id)
    || null;
}

export function isSealedRoundtableCreatorId(id) {
  return SEALED_ROUNDTABLE_CREATORS.some((creator) => creator.id === id);
}

export function getSealedRoundtableCreatorBase(id) {
  return SEALED_ROUNDTABLE_CREATORS.find((creator) => creator.id === id) || null;
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
    name: clean(config.name) || (base.id === "plot" ? clean(config.model) || clean(session.model) : "") || base.name,
    prompt: clean(config.prompt) || base.prompt,
    providerId: clean(config.providerId),
    apiBaseUrl: clean(defaults.baseUrl),
    apiKey: clean(defaults.apiKey),
    model: clean(config.model) || clean(session.model),
    networkEnabled: Boolean(config.networkEnabled),
    maxTokens: Number(config.maxTokens) || 0,
    temperature: Number.isFinite(Number(config.temperature)) ? Number(config.temperature) : session.temperature,
    contextOptions,
    activationProfile: clean(config.activationProfile),
    memories: normalizeAssistantMemories(config.memories),
    avatarDataUrl: clean(config.avatarDataUrl) || clean(base.avatarUrl),
    inheritedApiBaseUrl: true,
    inheritedApiKey: true,
    inheritedModel: !clean(config.model),
  };
}

export function createRoundAssistantConfigView(assistant, fallbackTemperature) {
  if (!assistant) return null;
  return {
    name: assistant.name,
    prompt: assistant.prompt,
    providerId: assistant.providerId || "",
    apiBaseUrl: "",
    apiKey: "",
    model: assistant.inheritedModel ? "" : assistant.model || "",
    networkEnabled: Boolean(assistant.networkEnabled),
    maxTokens: Number(assistant.maxTokens) || 0,
    contextTokenBudget: Number(assistant.contextTokenBudget) || 0,
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
  if (assistant.id === "skeptic") ["怀疑", "怀疑型", "质疑", "反对者", "挑刺", "风险", "风险评估"].forEach((name) => names.add(name));
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
