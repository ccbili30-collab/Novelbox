import { createDefaultLayout, hydrateLayout } from "../layout/layout-model.js";

export function createSettings() {
  return {
    systemPrompt: "你是小说创作助手。回答可以自由，但要尊重已有对话上下文；如果用户要求正文创作，优先输出可直接进入小说的中文正文。",
    model: "gpt-4o-mini",
    temperature: 0.8,
    contextCount: 12,
    unlimitedContext: false,
    maxTokens: 2048,
    stream: true,
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
  next.layout = hydrateLayout(next.layout);
  next.layoutPresets = Array.isArray(next.layoutPresets) ? next.layoutPresets : [];
  next.appearance = {
    ...createSettings().appearance,
    ...(next.appearance || {}),
  };
  return next;
}
