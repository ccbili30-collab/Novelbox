export const PUBLIC_CREATOR_STATUS = "in-development";

export function createPublicCreator(overrides = {}) {
  return {
    id: overrides.id || "",
    name: overrides.name || "主创",
    role: overrides.role || "creator",
    avatarDataUrl: overrides.avatarDataUrl || "",
  };
}

export function describeCreatorSystem() {
  return "创作者系统用于保存 AI 创作者身份、偏好和跨会话记忆。公开仓库保留结构壳，完整记忆系统仍在开发中。";
}
