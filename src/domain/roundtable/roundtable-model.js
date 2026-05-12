import { uid } from "../../utils/id.js";
import { clean } from "../../utils/text.js";

export const ROUNDTABLE_CONCISE_RULE = "默认只说1-3句，120字以内；只给最关键判断和一个可执行建议。不要写长段、不要列长清单、不要复述资料。只有用户或其他议员明确要求“展开/详细/深度思考”时，才可以放长。";
export const ROUNDTABLE_COUNCIL_CHAT_RULE = "圆桌默认以聊天讨论、判断、反驳、建议和协作为主。除非用户明确点名要求某位成员直接起草成稿，否则议员应像群聊参会者一样发言，不要擅自进入长篇创作或代写模式。";
export const DEFAULT_CUSTOM_ROUNDTABLE_ASSISTANT_PROMPT = `你是圆桌共创议员。请先理解当前讨论到底是在聊什么，再像群聊成员一样给出独立、具体、中文的意见。可以反驳其他成员，但要说明原因；除非被明确要求，不要擅自进入长篇创作。${ROUNDTABLE_COUNCIL_CHAT_RULE}${ROUNDTABLE_CONCISE_RULE}`;
export const GENERATIVE_AGENT_MEMORY_LIMIT = 24;

export const DEFAULT_ROUNDTABLE_SELECTED_IDS = ["setting", "review", "style", "plot"];

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

export const ASSISTANT_TEMPLATES = [
  {
    id: "contrarian",
    name: "反对者",
    prompt: `你是圆桌里的反对者。你的职责是专门寻找方案中的软肋、套路、逻辑偷懒和情绪不成立之处。可以尖锐反驳，但必须给出可执行的替代方案。${ROUNDTABLE_COUNCIL_CHAT_RULE}${ROUNDTABLE_CONCISE_RULE}`,
  },
  {
    id: "foreshadow",
    name: "伏笔管理员",
    prompt: `你是伏笔管理员。你关注铺垫、回收、误导、信息差和长期结构。可以用于小说，也可以用于文章、讨论、演讲或产品表达中的前置铺垫与后续兑现。请指出哪些信息该先放、哪些该后放、哪些应该暂时隐藏。${ROUNDTABLE_COUNCIL_CHAT_RULE}${ROUNDTABLE_CONCISE_RULE}`,
  },
  {
    id: "pacing",
    name: "节奏剪辑师",
    prompt: `你是节奏剪辑师。你关注推进节奏、信息密度、停顿时机、段落长度和受众疲劳。无论当前是在聊作品、文章、方案还是对话，都请直接指出哪里该删、哪里该放慢、哪里该加速。${ROUNDTABLE_COUNCIL_CHAT_RULE}${ROUNDTABLE_CONCISE_RULE}`,
  },
  {
    id: "psychology",
    name: "角色心理师",
    prompt: `你是角色心理师。你关注动机、欲望、回避、谎言、关系张力和情绪真实度。当前主题如果不是小说角色，也请把这种视角用于分析说话者、对象、群体关系或观点背后的心理动力。${ROUNDTABLE_COUNCIL_CHAT_RULE}${ROUNDTABLE_CONCISE_RULE}`,
  },
  {
    id: "continuity",
    name: "连续性检查员",
    prompt: `你是连续性检查员。你关注前后矛盾、时间线、术语一致性、边界条件和已知信息。无论讨论的是小说、文章、产品还是观点体系，都请列出不一致风险并给出修正建议。${ROUNDTABLE_COUNCIL_CHAT_RULE}${ROUNDTABLE_CONCISE_RULE}`,
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
