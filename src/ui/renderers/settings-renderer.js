/**
 * Settings panel renderer.
 *
 * Pulls renderSettings + renderSettingsPage + renderProviderSwitcher
 * out of main.js into one factory. Every dependency is injected so
 * the renderer can be unit-tested with mock els / mock state.
 *
 * createSettingsRenderer({...}) returns { renderSettings,
 * renderSettingsPage, renderProviderSwitcher }.
 */

export function createSettingsRenderer({
  els,
  doc = typeof document !== "undefined" ? document : null,
  ctx,                         // { apiSettings, globalModelDefaults, sessionSettings, sessionAppearance, activeApiProvider }
  settingsPageMeta,
  getActiveSettingsPage,
  formatLayoutValue,
  renderAvatarPreview,
  renderBackgroundPreview,
  renderSettingsModelPicker,
  renderCreatorsPage,
  clean,
  escapeHtml,
}) {
  if (!ctx) throw new TypeError("createSettingsRenderer needs a ctx");

  function renderSettingsPage() {
    if (!els) return;
    const page = getActiveSettingsPage?.() || "home";
    const meta = settingsPageMeta[page] || settingsPageMeta.home;
    if (els.settingsPanel) els.settingsPanel.dataset.settingsPage = page;
    if (els.settingsPanelTitle) els.settingsPanelTitle.textContent = meta.title;
    if (els.settingsPanelSubtitle) els.settingsPanelSubtitle.textContent = meta.subtitle;
    if (els.settingsBack) els.settingsBack.hidden = page === "home";
    els.settingsViews?.forEach((view) => {
      view.hidden = view.dataset.settingsView !== page;
    });
  }

  function renderProviderSwitcher(api = ctx.apiSettings()) {
    if (!els?.providerSwitcher) return;
    els.providerSwitcher.innerHTML = api.providers.map((provider) => `
      <button class="${provider.id === api.currentProviderId ? "selected" : ""}" type="button" data-command="select-provider" data-provider-id="${escapeHtml(provider.id)}">
        <span>${escapeHtml(provider.name || "未命名提供方")}</span>
      </button>
    `).join("");
  }

  function isFocused(el) {
    return Boolean(doc && el && doc.activeElement === el);
  }

  function renderSettings() {
    if (!els) return;
    const api = ctx.apiSettings();
    const defaults = ctx.globalModelDefaults();
    const s = ctx.sessionSettings();
    const provider = ctx.activeApiProvider(api);
    const appearance = ctx.sessionAppearance();

    if (els.systemPrompt && !isFocused(els.systemPrompt)) els.systemPrompt.value = "";
    if (els.providerSelect) {
      els.providerSelect.innerHTML = api.providers
        .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`)
        .join("");
      els.providerSelect.value = api.currentProviderId;
    }
    renderProviderSwitcher(api);

    if (els.providerName && !isFocused(els.providerName)) els.providerName.value = provider?.name || "";
    if (!isFocused(els.baseUrl))   els.baseUrl.value = api.baseUrl;
    if (!isFocused(els.apiKey))    els.apiKey.value = api.apiKey;
    if (!isFocused(els.modelInput)) els.modelInput.value = defaults.model;
    if (els.contextTokenBudget && !isFocused(els.contextTokenBudget)) {
      els.contextTokenBudget.value = Number(api.contextTokenBudget) || 200000;
    }
    if (els.userNameInput && !isFocused(els.userNameInput)) {
      els.userNameInput.value = clean(appearance.userName) || "我";
    }
    renderAvatarPreview?.(els.userAvatarPreview, appearance.userAvatarDataUrl, clean(appearance.userName) || "我");
    renderBackgroundPreview?.(els.sessionBackgroundPreview, appearance.backgroundDataUrl);

    if (!isFocused(els.contextCount)) els.contextCount.value = defaults.contextCount;
    if (!isFocused(els.maxTokens))    els.maxTokens.value = defaults.maxTokens;
    els.temperature.value = defaults.temperature;
    els.temperatureLabel.textContent = Number(defaults.temperature).toFixed(2);
    els.unlimitedContext.checked = defaults.unlimitedContext;
    els.stream.checked = defaults.stream;

    els.layoutInputs?.forEach((input) => {
      const key = input.dataset.layoutKey;
      if (!isFocused(input)) input.value = s.layout[key];
    });
    els.layoutValues?.forEach((value) => {
      const key = value.dataset.layoutValue;
      value.textContent = formatLayoutValue(key, s.layout[key]);
    });

    renderSettingsModelPicker?.();
    renderCreatorsPage?.();
    renderSettingsPage();
  }

  return { renderSettings, renderSettingsPage, renderProviderSwitcher };
}
