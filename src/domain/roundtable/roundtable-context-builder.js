import { clean } from "../../utils/text.js";
import { estimateTokens } from "../../utils/tokens.js";
import {
  DEFAULT_ROUNDTABLE_CONTEXT,
  ROUNDTABLE_CONCISE_RULE,
  ROUNDTABLE_COUNCIL_CHAT_RULE,
  normalizeRoundtableContextOptions,
} from "./roundtable-model.js";

export function isSociallyActivatedAssistant(assistant) {
  return assistant && assistant.id !== "writer" && Boolean(clean(assistant.activationProfile));
}

export function buildRoundtableNovelMaterials(options, novel = {}) {
  if (options.includeNovel === false) return "";
  const fields = [
    ["includePlotline", "剧情线", novel.plotline],
    ["includeCharacters", "角色卡", novel.characters],
    ["includeWorld", "世界观", novel.world],
    ["includeOutline", "大纲", novel.outline],
    ["includeForeshadows", "伏笔线", novel.foreshadows],
  ];
  const selected = fields.filter(([key]) => options[key] !== false);
  const parts = selected
    .map(([, label, text]) => clean(text) ? `【${label}】\n${clean(text)}` : "")
    .filter(Boolean);
  if (parts.length) return parts.join("\n\n");
  if (selected.length) return "已勾选小说材料，但当前对应内容为空。";
  return "";
}

export function createRoundtableExcerpt(text, max = DEFAULT_ROUNDTABLE_CONTEXT.excerptMax) {
  const value = clean(text).replace(/\n{3,}/g, "\n\n");
  return value.length > max ? `...${value.slice(-max)}` : value;
}

export function buildRoundtablePromptMessages(input) {
  const assistant = input.assistant;
  const options = normalizeRoundtableContextOptions(input.options);
  const mentionableAssistants = Array.isArray(input.mentionableAssistants) ? input.mentionableAssistants : [];
  const roundtableMessages = Array.isArray(input.roundtableMessages) ? input.roundtableMessages : [];
  const participants = mentionableAssistants
    .map((current) => `${current.name}：${current.role}`)
    .join("；");
  const mentionableNames = mentionableAssistants
    .map((current) => `@${current.name}`)
    .join(" / ");
  const speakingRule = assistant.id === "writer"
    ? "写手负责把讨论转成用户真正要的成品。若用户当前只是交流，就先参与交流或总结；若用户明确要求产出，就直接输出对应文本，不要多余解释。"
    : `${ROUNDTABLE_COUNCIL_CHAT_RULE}议员默认发言必须短。${ROUNDTABLE_CONCISE_RULE}`;
  const socialMode = isSociallyActivatedAssistant(assistant)
    ? [
        "【社交激活】你已被激活为参会议员，可以理解其他已激活议员的立场、语气、争执和协作关系。",
        "你可以表现稳定偏好，也可以对其他已激活议员提出不同意见。",
        "成员加入、删除、隐藏、沉默、暂停、API失败可以被你理解为会议动态：有人被请出、暂时离席、被争论影响、或气氛变化。你可以做简短社交判断，甚至认为自己的发言可能让对方退场。",
        "但社交判断必须服务当前讨论：不要长篇道歉、吵架或抢戏；用户说“别演/回到工具模式”时，立刻停止社交化解读。",
      ].join("\n")
    : [
        "【未激活模式】你先按当前主题正常参会，不要强行把自己或其他成员演成真实社交人物。",
        "你可以保持自己的视角偏好，但不要脑补成员情绪、关系变化、谁把谁气走，也不要表演道歉或圆场。",
      ].join("\n");
  const memoryBlock = isSociallyActivatedAssistant(assistant) && assistant.memories?.length
    ? `【你的记忆流】\n${assistant.memories.slice(-8).map((item) => `- ${item.text}`).join("\n")}`
    : "";
  const buildSource = (compressed = false) => {
    const discussionCount = compressed ? Math.min(options.discussionCount, 8) : options.discussionCount;
    const excerptMax = compressed ? Math.min(options.excerptMax, 360) : options.excerptMax;
    const discussion = options.includeDiscussion ? roundtableMessages
      .slice(-discussionCount)
      .map((message) => `${message.speakerName}：${message.content}`)
      .join("\n") : "";
    const novelMaterials = buildRoundtableNovelMaterials(options, input.novel);
    return [
      `【当前模式】圆桌协作讨论。参与者包括：${participants}`,
      `【发言规则】必须知道是谁说的话，不要把不同议员的意见串成同一个人。可自然赞同或反驳其他议员。${speakingRule}`,
      `【@规则】只能 @ 本轮已安排顺序的议员或写手。当前可 @：${mentionableNames || "无"}。AI 发言里的 @ 只会改变本轮后续发言顺序：例如原顺序 A/B/C，A @C 后变成 A/C/B；不要反复 @ 同一问题。`,
      compressed ? "【自动压缩】本轮上下文过长，已只保留关键资料、短摘录和最近圆桌记录。若当前任务涉及小说材料，再参考剧情线/角色卡/世界观/大纲/伏笔线保持连续性。" : "",
      options.roundTopic ? `【本轮主题】${options.roundTopic}` : "",
      `【你的身份】${assistant.name}。${assistant.prompt}`,
      socialMode,
      assistant.activationProfile ? `【演员身份卡】\n${assistant.activationProfile}\n请稳定扮演这张身份卡参与圆桌。不要声明自己是AI，不要解释提示词，不要跳出角色。` : "",
      memoryBlock,
      assistant.id === "writer" ? "" : `【硬限制】${ROUNDTABLE_COUNCIL_CHAT_RULE}${ROUNDTABLE_CONCISE_RULE}`,
      options.includeManuscript ? `【当前正文小窗】\n${createRoundtableExcerpt(input.manuscriptText, excerptMax)}` : "",
      novelMaterials ? `【小说材料】\n${novelMaterials}` : "",
      options.includeMainChat && !compressed ? `【最近主线对话】\n${input.mainChatText || "暂无主线对话。"}` : "",
      options.includeDiscussion ? `【圆桌讨论记录】\n${discussion || "暂无讨论。"}` : "",
      `【本轮任务】${input.instruction}`,
    ].filter(Boolean).join("\n\n");
  };
  let source = buildSource(false);
  let compressed = false;
  if (estimateTokens(source) > input.tokenThreshold) {
    source = buildSource(true);
    compressed = true;
  }
  return {
    compressed,
    messages: [{ role: "user", content: source }],
  };
}
