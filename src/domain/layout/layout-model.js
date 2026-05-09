export function createDefaultLayout() {
  return {
    composerMinHeight: 66,
    composerFontSize: 16,
    sendButtonSize: 32,
    toolButtonSize: 26,
    messageFontSize: 17,
    messageLineHeight: 150,
    assistantLeft: 12,
    messageSidePadding: 18,
    messageGap: 12,
    userBubblePadding: 2,
    metaFontSize: 12,
    footerGap: 8,
    moreButtonSize: 28,
  };
}

export function hydrateLayout(layout) {
  const defaults = createDefaultLayout();
  const next = { ...defaults, ...(layout || {}) };
  if (layout?.messageGap === 22) next.messageGap = defaults.messageGap;
  if (layout?.userBubblePadding === 5) next.userBubblePadding = defaults.userBubblePadding;
  Object.keys(defaults).forEach((key) => {
    const value = Number(next[key]);
    next[key] = Number.isFinite(value) ? value : defaults[key];
  });
  return next;
}
