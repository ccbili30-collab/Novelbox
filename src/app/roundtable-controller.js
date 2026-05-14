export function createRoundtableController() {
  return {
    status: "roundtable-core-in-development",
    toggleRoundtable() {
      return {
        enabled: true,
        message: "圆桌模式入口已公开，核心调度仍在开发中。",
      };
    },
    getSessionImportCandidates() {
      return [];
    },
    importMemberFromSession() {
      return {
        ok: false,
        message: "创作者入席逻辑仍在开发中。",
      };
    },
  };
}
