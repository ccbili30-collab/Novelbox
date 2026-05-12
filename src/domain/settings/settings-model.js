import { createDefaultLayout, hydrateLayout } from "../layout/layout-model.js";

export function createSettings() {
  return {
    systemPrompt: "你是一个通用中文协作助手。先理解用户当前是在聊天、讨论、分析、创作还是请求正式成稿，再用合适的方式回应。尊重已有上下文，回答自然、具体、真诚。除非用户明确要求，不要擅自进入小说写作模式；如果用户要求创作，请按任务需要输出对应类型的内容。",
    model: "gpt-4o-mini",
    temperature: 0.8,
    contextCount: 12,
    unlimitedContext: false,
    maxTokens: 2048,
    stream: true,
    streamTouched: false,
    layout: createDefaultLayout(),
    layoutPresets: [],
    appearance: {
      userName: "我",
      userAvatarDataUrl: "",
      backgroundDataUrl: "",
    },
  };
}

export function hydrateSessionSettings(settings) {
  const next = { ...createSettings(), ...(settings || {}) };
  next.stream = settings?.streamTouched ? Boolean(settings.stream) : true;
  next.streamTouched = Boolean(settings?.streamTouched);
  next.layout = hydrateLayout(next.layout);
  next.layoutPresets = Array.isArray(next.layoutPresets) ? next.layoutPresets : [];
  next.appearance = {
    ...createSettings().appearance,
    ...(next.appearance || {}),
  };
  return next;
}
