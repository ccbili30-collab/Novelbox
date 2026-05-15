/**
 * MD3 bootstrap — wires every M3-era cross-cutting concern that used
 * to live at the bottom of main.js:
 *
 *   - Theme picker (settings → 外观)
 *   - Scroll-aware top app bar
 *   - Keyboard help shortcut + window.tbirdHelp / tbirdVersion
 *   - "What's new" snackbar after upgrade
 *   - Scroll-to-bottom FAB + empty state
 *   - Empty-state suggestion chips
 *   - MutationObserver that re-syncs FAB + empty when the chat
 *     surface mutates
 *
 * Every bit of behaviour is gated behind a feature toggle so the
 * teardown can opt out of one piece at a time. Returns a teardown
 * thunk for tests.
 */

import { initThemeEngine, setThemeMode, setSeedColor, getThemeMode, getSeedColor } from "../../ui/components/theme-engine.js";
import { bindScrollAwareBar } from "../../ui/components/scroll-aware-bars.js";
import { bindKeyboardHelpShortcut, openKeyboardHelp } from "../../ui/components/keyboard-help.js";
import { checkAndAnnounceUpgrade, VERSION as APP_VERSION } from "../../ui/components/whats-new.js";

function syncThemePickerUi(doc) {
  const mode = getThemeMode();
  doc.querySelectorAll("[data-theme-mode]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.themeMode === mode));
  });
  const seed = getSeedColor() || "";
  doc.querySelectorAll(".md-seed[data-seed]").forEach((btn) => {
    const s = btn.dataset.seed === "custom" ? null : btn.dataset.seed;
    if (s == null) {
      btn.setAttribute("aria-pressed", "false");
    } else {
      btn.setAttribute("aria-pressed", String(s.toLowerCase() === seed.toLowerCase()));
    }
  });
}

function bindThemePicker(doc) {
  doc.addEventListener("click", (event) => {
    const modeBtn = event.target.closest?.("[data-theme-mode]");
    if (modeBtn) {
      setThemeMode(modeBtn.dataset.themeMode);
      syncThemePickerUi(doc);
      return;
    }
    const seedBtn = event.target.closest?.(".md-seed[data-seed]");
    if (seedBtn) {
      if (seedBtn.dataset.seed === "custom") {
        doc.getElementById("customSeedColor")?.click();
      } else {
        setSeedColor(seedBtn.dataset.seed || "");
        syncThemePickerUi(doc);
      }
    }
  });
  const customSeed = doc.getElementById("customSeedColor");
  customSeed?.addEventListener("input", () => {
    setSeedColor(customSeed.value);
    syncThemePickerUi(doc);
  });
  syncThemePickerUi(doc);
}

function bindScrollFabAndEmptyState({ doc, win, messages, input }) {
  const scrollFab = doc.getElementById("scrollToBottom");
  const emptyState = doc.getElementById("messageEmpty");
  let fabRaf = 0;
  function syncScrollFab() {
    if (!scrollFab || !messages) return;
    const hasContent = messages.children.length > 0;
    const distance = messages.scrollHeight - messages.scrollTop - messages.clientHeight;
    const shouldShow = hasContent && distance > 240 && !messages.hidden;
    scrollFab.hidden = !shouldShow;
  }
  function syncMessageEmpty() {
    if (!emptyState) return;
    const empty = !messages?.hidden && (!messages?.children?.length);
    emptyState.hidden = !empty;
  }
  messages?.addEventListener("scroll", () => {
    if (fabRaf) return;
    fabRaf = win.requestAnimationFrame(() => { fabRaf = 0; syncScrollFab(); });
  }, { passive: true });
  scrollFab?.addEventListener("click", () => {
    messages.scrollTo({ top: messages.scrollHeight, behavior: "smooth" });
  });
  if (typeof win.MutationObserver === "function" && messages) {
    let pending = false;
    const observer = new win.MutationObserver(() => {
      if (pending) return;
      pending = true;
      win.requestAnimationFrame(() => {
        pending = false;
        syncScrollFab();
        syncMessageEmpty();
      });
    });
    observer.observe(messages, { childList: true });
  }
  doc.addEventListener("click", (event) => {
    const chip = event.target.closest?.("[data-empty-prompt]");
    if (!chip || !input) return;
    input.value = chip.dataset.emptyPrompt || "";
    input.focus();
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  syncScrollFab();
  syncMessageEmpty();
}

/**
 * Boot every M3 cross-cutting concern. Returns nothing today; future
 * teardown can return a cleanup thunk.
 */
export function bootMd3({
  doc = typeof document !== "undefined" ? document : null,
  win = typeof window !== "undefined" ? window : null,
  els,
  features = {
    theme: true,
    scrollAwareBar: true,
    keyboardHelp: true,
    whatsNew: true,
    scrollFab: true,
  },
} = {}) {
  if (!doc || !win || !els) return;

  if (features.theme) {
    try { initThemeEngine(); } catch (_) { /* SSR */ }
    bindThemePicker(doc);
    win.tbirdTheme = { setThemeMode, setSeedColor, getThemeMode, getSeedColor };
  }

  if (features.scrollAwareBar) {
    const topbar = doc.querySelector(".topbar");
    if (topbar && els.messages) bindScrollAwareBar(topbar, els.messages);
    if (topbar && els.roundtableDiscussion) bindScrollAwareBar(topbar, els.roundtableDiscussion);
  }

  if (features.keyboardHelp) {
    bindKeyboardHelpShortcut();
    win.tbirdHelp = { openKeyboardHelp };
  }

  if (features.whatsNew) {
    try {
      checkAndAnnounceUpgrade({ onLearnMore: openKeyboardHelp });
      win.tbirdVersion = APP_VERSION;
    } catch (_) { /* SSR / test */ }
  }

  if (features.scrollFab) {
    bindScrollFabAndEmptyState({ doc, win, messages: els.messages, input: els.input });
  }
}
