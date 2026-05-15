/**
 * Scroll + layout helpers extracted from main.js.
 *
 * createScrollFollower(scroller, threshold)
 *   -> { shouldFollowBottom, scrollBottom(force) }
 *   - shouldFollowBottom(): true when the scroller is within
 *     `threshold` px of the bottom (legacy default 90).
 *   - scrollBottom(force): rAF-deferred scroll to bottom; respects
 *     shouldFollowBottom unless force=true.
 *
 * createLayoutApplier({ root, body, getLayout, getAppearance, clean })
 *   -> { applyLayout(), applySessionAppearance() }
 *   - applyLayout(): writes 16 CSS variables on the root element from
 *     the user's layout settings (composer, send-button, font-size,
 *     bubble padding, gaps).
 *   - applySessionAppearance(): writes the session background image
 *     to a CSS var and toggles a body class so panel CSS can react.
 */

export function createScrollFollower(scroller, threshold = 90) {
  return {
    shouldFollowBottom() {
      if (!scroller) return false;
      return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < threshold;
    },
    scrollBottom(force = false) {
      if (!scroller || typeof requestAnimationFrame === "undefined") return;
      requestAnimationFrame(() => {
        const reach = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
        if (!force && reach >= threshold) return;
        scroller.scrollTop = scroller.scrollHeight;
      });
    },
  };
}

export function createLayoutApplier({ root, body, getLayout, getAppearance, clean }) {
  if (typeof getLayout !== "function") {
    throw new TypeError("createLayoutApplier requires getLayout()");
  }
  if (typeof getAppearance !== "function") {
    throw new TypeError("createLayoutApplier requires getAppearance()");
  }
  const cleanFn = typeof clean === "function" ? clean : (s) => String(s ?? "").trim();
  return {
    applyLayout() {
      if (!root || !root.style) return;
      const layout = getLayout();
      const s = root.style;
      s.setProperty("--composer-min-height",   `${layout.composerMinHeight}px`);
      s.setProperty("--composer-font-size",    `${layout.composerFontSize}px`);
      s.setProperty("--send-button-size",      `${layout.sendButtonSize}px`);
      s.setProperty("--tool-button-size",      `${layout.toolButtonSize}px`);
      s.setProperty("--font-size",             `${layout.messageFontSize}px`);
      s.setProperty("--line-height",           `${layout.messageLineHeight / 100}`);
      s.setProperty("--assistant-left",        `${layout.assistantLeft}px`);
      s.setProperty("--message-side-padding",  `${layout.messageSidePadding}px`);
      s.setProperty("--message-gap",           `${layout.messageGap}px`);
      s.setProperty("--user-bubble-padding-y", `${layout.userBubblePadding}px`);
      s.setProperty("--user-bubble-padding-x", `${Math.round(layout.userBubblePadding * 1.3)}px`);
      s.setProperty("--meta-font-size",        `${layout.metaFontSize}px`);
      s.setProperty("--footer-gap",            `${layout.footerGap}px`);
      s.setProperty("--more-button-size",      `${layout.moreButtonSize}px`);
      s.setProperty("--composer-max-textarea", `${Math.max(44, layout.composerMinHeight + 8)}px`);
    },
    applySessionAppearance() {
      if (!root || !root.style) return;
      const appearance = getAppearance();
      const bg = cleanFn(appearance.backgroundDataUrl);
      root.style.setProperty("--session-bg-image", bg ? `url("${bg}")` : "none");
      if (body && body.classList) body.classList.toggle("has-session-background", Boolean(bg));
    },
  };
}
