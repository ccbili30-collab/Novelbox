/**
 * Application-wide constants extracted from main.js as part of the
 * structural rewrite. Each constant keeps its original name so that
 * existing call sites can `import` them and behave identically.
 *
 * Grouped by domain:
 *   - Conversation control
 *   - Bridge / API timing
 *   - Context windows
 *   - UI motion timings
 *   - Attachment + image limits
 *   - Misc text constants
 */

/* === Conversation control === */
export const CONTINUE_PROMPT =
  "继续完成上一条请求，直接给出用户要的内容，不要重复确认。";

/* === Bridge / API timing === */
export const BRIDGE_TIMEOUT = 160000;

/* === Context windows === */
export const AUTO_CONTEXT_TOKEN_THRESHOLD = 18000;
export const COMPRESSED_CONTEXT_TAIL_COUNT = 6;
export const PAPER_DEEP_COLLAPSE_THRESHOLD = 0.035;

/* === UI motion (legacy press/ripple — kept for back-compat;
 * the new MD3 state-layer no longer relies on them but the JS that
 * reads these values still exists.) === */
export const MOTION_PULSE_MS = 260;
export const MOTION_RIPPLE_MS = 520;

/* === Attachments and inline images === */
export const LOCAL_IMAGE_MAX_BYTES = 2.5 * 1024 * 1024;
export const LOCAL_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);
export const CHAT_IMAGE_MAX_BYTES = Math.min(LOCAL_IMAGE_MAX_BYTES, 1.5 * 1024 * 1024);
export const CHAT_IMAGE_LIMIT = 4;
export const CHAT_ATTACHMENT_LIMIT = 6;
export const CHAT_TEXT_FILE_MAX_BYTES = 1024 * 1024;
export const CHAT_TEXT_EXCERPT_LIMIT = 12000;
export const CHAT_TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "json", "csv", "log", "yaml", "yml",
]);

/* === Source notes === */
export const GENERATIVE_AGENT_SOURCE_NOTE =
  "人格记忆层参考 joonspk-research/generative_agents 的 memory stream / reflection 思路：观察被保存为短记忆，之后再进入角色提示。";
