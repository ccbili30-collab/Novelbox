import { clean } from "../../utils/text.js";

export function buildNovelMemory(novel) {
  const parts = [
    ["剧情线", novel.plotline],
    ["角色卡", novel.characters],
    ["世界观", novel.world],
    ["大纲", novel.outline],
    ["伏笔线", novel.foreshadows],
    ["正文库节选", clean(novel.body).slice(-6000)],
  ].filter(([, text]) => clean(text));
  if (!parts.length) return "";
  return [
    "以下是小说创作记忆。续写、改写、解释人物动机时必须优先参考这些资料，不要自顾自另起设定。",
    ...parts.map(([title, text]) => `【${title}】\n${clean(text)}`),
  ].join("\n\n");
}

export function buildNovelSourceText(novel, recentChatText = "") {
  return [
    clean(novel.body) ? `【正文库】\n${clean(novel.body).slice(-12000)}` : "",
    clean(novel.plotline) ? `【已有剧情线】\n${clean(novel.plotline)}` : "",
    clean(novel.characters) ? `【已有角色卡】\n${clean(novel.characters)}` : "",
    clean(novel.world) ? `【已有世界观】\n${clean(novel.world)}` : "",
    clean(novel.outline) ? `【已有大纲】\n${clean(novel.outline)}` : "",
    clean(novel.foreshadows) ? `【已有伏笔线】\n${clean(novel.foreshadows)}` : "",
    clean(recentChatText) ? `【最近对话】\n${recentChatText}` : "",
  ].filter(Boolean).join("\n\n");
}
