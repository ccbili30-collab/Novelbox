/**
 * Event-listener wiring for the bottom of main.js.
 *
 * Each helper takes a tiny handlers bag and a slice of the els
 * registry, then calls addEventListener as a series of declarative
 * statements. The legacy main.js wired ~95 listeners inline at module
 * scope; pulling them into named factories makes the bindings
 * inspectable and lets tests pass mock els.
 *
 * Returns {} (no teardown) for now — every binding lives for the
 * lifetime of the page. Future hot-reload work can return cleanups.
 */

/**
 * "Click the visible button → click the hidden <input type=file>"
 * pattern repeated 4× in main.js. Centralised here so adding a new
 * file picker means one line.
 */
export function bindFilePicker({ button, fileInput, onChange }) {
  if (button && fileInput) button.addEventListener("click", () => fileInput.click());
  if (fileInput && typeof onChange === "function") fileInput.addEventListener("change", onChange);
}

/**
 * Appearance + file-import bindings.
 *
 * Handlers needed:
 *   updateSessionUserName, handleChatImageSelected,
 *   clearUserAvatar, handleUserAvatarSelected,
 *   clearSessionBackground, handleSessionBackgroundSelected,
 *   handleBodyFileSelected, handleSessionImportSelected,
 *   handleCreatorImportSelected, handleGlobalBackupImportSelected.
 */
export function wireAppearanceAndImports({ els, h = {} }) {
  if (!els) return;
  els.userNameInput?.addEventListener("input", h.updateSessionUserName || (() => {}));
  els.chatImageFile?.addEventListener("change", h.handleChatImageSelected || (() => {}));
  bindFilePicker({
    button: els.chooseUserAvatar,
    fileInput: els.userAvatarFile,
    onChange: h.handleUserAvatarSelected || (() => {}),
  });
  els.clearUserAvatar?.addEventListener("click", h.clearUserAvatar || (() => {}));
  bindFilePicker({
    button: els.chooseSessionBackground,
    fileInput: els.sessionBackgroundFile,
    onChange: h.handleSessionBackgroundSelected || (() => {}),
  });
  els.clearSessionBackground?.addEventListener("click", h.clearSessionBackground || (() => {}));

  els.bodyImportFile?.addEventListener("change", h.handleBodyFileSelected || (() => {}));
  els.sessionImportFile?.addEventListener("change", h.handleSessionImportSelected || (() => {}));
  els.creatorImportFile?.addEventListener("change", h.handleCreatorImportSelected || (() => {}));
  els.globalBackupImportFile?.addEventListener("change", h.handleGlobalBackupImportSelected || (() => {}));
}

/**
 * Bind the global model defaults inputs (temperature slider, unlimited
 * context checkbox, stream toggle).
 *
 * Handlers needed:
 *   onTemperatureInput(el), onUnlimitedContextChange(el), onStreamChange(el).
 */
export function wireGlobalModelInputs({ els, h = {} }) {
  if (!els) return;
  els.temperature?.addEventListener("input", () => h.onTemperatureInput?.(els.temperature));
  els.unlimitedContext?.addEventListener("change", () => h.onUnlimitedContextChange?.(els.unlimitedContext));
  els.stream?.addEventListener("change", () => h.onStreamChange?.(els.stream));
}

/**
 * Bind the per-field inputs that update session-level data: novel
 * fields, layout numeric inputs, history search.
 *
 * Handlers:
 *   onLayoutInput(input), onNovelFieldInput(field), onHistorySearch().
 */
export function wireSessionFieldInputs({ els, h = {} }) {
  if (!els) return;
  els.layoutInputs?.forEach((input) => {
    input.addEventListener("input", () => h.onLayoutInput?.(input));
  });
  els.novelFields?.forEach((field) => {
    field.addEventListener("input", () => h.onNovelFieldInput?.(field));
  });
  els.historySearch?.addEventListener("input", h.onHistorySearch || (() => {}));
}

/**
 * Bind the assistant-config dialog inputs (provider switcher,
 * temperature slider, model name + autocomplete, override toggle).
 *
 * Handlers:
 *   onAssistantTemperature(el), onAssistantModelFocus(),
 *   onAssistantModelInput(), onAssistantProviderChange(),
 *   onAssistantApiOverrideChange().
 */
export function wireAssistantConfigInputs({ els, h = {} }) {
  if (!els) return;
  els.assistantTemperatureInput?.addEventListener("input", () =>
    h.onAssistantTemperature?.(els.assistantTemperatureInput)
  );
  els.assistantModelInput?.addEventListener("focus", () => h.onAssistantModelFocus?.());
  els.assistantModelInput?.addEventListener("input", () => h.onAssistantModelInput?.());
  els.assistantProviderSelect?.addEventListener("change", () => h.onAssistantProviderChange?.());
  els.assistantApiOverrideEnabledInput?.addEventListener("change", () => h.onAssistantApiOverrideChange?.());
}
