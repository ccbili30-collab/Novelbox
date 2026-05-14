export const PUBLIC_ROUNDTABLE_STATUS = "in-development";

export function createPublicRoundtableState(overrides = {}) {
  return {
    enabled: Boolean(overrides.enabled),
    topic: overrides.topic || "",
    selectedIds: Array.isArray(overrides.selectedIds) ? overrides.selectedIds : [],
    messages: Array.isArray(overrides.messages) ? overrides.messages : [],
  };
}

export function describeRoundtableMode() {
  return "圆桌模式会让多个 AI 创作者围绕同一作品讨论、审视、落稿。公开仓库保留结构壳，核心调度仍在开发中。";
}
