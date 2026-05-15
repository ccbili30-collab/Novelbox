/**
 * "What's new" notice — shows once per app release. Stores the last
 * shown version under `tbird.lastSeenVersion` in localStorage and
 * compares against the current bundled version. If they differ, the
 * snackbar surfaces with an action button that opens the keyboard
 * help dialog so users discover the new features.
 *
 * Bumping VERSION here is the only thing required to re-trigger the
 * notice on every install.
 */

import { showSnackbar } from "./snackbar.js";

export const VERSION = "0.2.0-md3-redesign";
const STORAGE_KEY = "tbird.lastSeenVersion";
const MESSAGE = "已升级到 Material You 设计：换了主题、聊天气泡、键盘快捷键，按 ? 看新功能。";

function safeStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function checkAndAnnounceUpgrade({ onLearnMore } = {}) {
  const storage = safeStorage();
  const last = storage?.getItem(STORAGE_KEY);
  if (last === VERSION) return false;
  // Defer until DOM ready + a short idle window so it never fights
  // the first paint or the bootstrap snackbar host mount.
  const announce = () => {
    showSnackbar(MESSAGE, {
      duration: 8000,
      action: {
        label: "看看",
        onClick: () => {
          try { onLearnMore?.(); } catch (_) {}
        },
      },
    });
    storage?.setItem(STORAGE_KEY, VERSION);
  };
  if (typeof document !== "undefined" && document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(announce, 800), { once: true });
  } else {
    setTimeout(announce, 800);
  }
  return true;
}
