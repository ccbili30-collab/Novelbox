export function createCreatorController() {
  return {
    status: "creator-core-in-development",
    listCreators() {
      return [];
    },
    openCreatorPrivateSession() {
      return {
        ok: false,
        message: "创作者记忆与跨会话身份仍在开发中。",
      };
    },
  };
}
