/**
 * Layout-preset controller.
 *
 * Six commands extracted from main.js: applyLayoutPreset,
 * applyCustomLayoutPreset, saveLayoutPreset, deleteLayoutPreset,
 * resetLayoutParams, copyLayoutParams.
 *
 * Each one needs to:
 *   - read or write session.settings via the state context
 *   - re-render + resize the composer
 *   - persist
 *   - flash a toast
 *
 * createLayoutPresetController({...}) returns those six callables;
 * every dependency is injected so the file is testable in isolation.
 */

export function createLayoutPresetController({
  presets,                  // built-in named presets, eg. { compact, comfy, large }
  sessionSettings,          // () => session.settings
  hydrateLayout,            // (raw) => fully-shaped layout
  createDefaultLayout,      // () => default layout
  uid,                      // (prefix) => unique id
  clean,                    // string trimmer
  render,                   // () => void  (schedules a re-render)
  resizeInput,              // () => void  (re-measures composer)
  persist,                  // () => void  (debounced persist)
  showToast,                // (message) => void
  copyText,                 // (text) => Promise<void>
  presetNameInput,          // optional <input> whose value seeds the preset name
} = {}) {
  function applyLayoutPreset(name) {
    const preset = presets?.[name];
    if (!preset) return;
    sessionSettings().layout = hydrateLayout(preset);
    render();
    resizeInput();
    persist?.();
    showToast?.("排版预设已应用");
  }

  function applyCustomLayoutPreset(id) {
    const settings = sessionSettings();
    const preset = (settings.layoutPresets || []).find((item) => item.id === id);
    if (!preset) return;
    settings.layout = hydrateLayout(preset.layout);
    render();
    resizeInput();
    persist?.();
    showToast?.("排版预设已应用");
  }

  function saveLayoutPreset() {
    const settings = sessionSettings();
    const inputValue = clean(presetNameInput?.value);
    const name = inputValue || `排版 ${(settings.layoutPresets?.length || 0) + 1}`;
    const record = {
      id: uid("layout"),
      name,
      layout: hydrateLayout(settings.layout),
      createdAt: Date.now(),
    };
    settings.layoutPresets = [record, ...(settings.layoutPresets || [])].slice(0, 12);
    if (presetNameInput) presetNameInput.value = "";
    render();
    persist?.();
    showToast?.("已保存排版预设");
    return record;
  }

  function deleteLayoutPreset(id) {
    const settings = sessionSettings();
    settings.layoutPresets = (settings.layoutPresets || []).filter((item) => item.id !== id);
    render();
    persist?.();
    showToast?.("已删除排版预设");
  }

  function resetLayoutParams() {
    sessionSettings().layout = createDefaultLayout();
    render();
    resizeInput();
    persist?.();
    showToast?.("已恢复默认排版");
  }

  function copyLayoutParams() {
    return copyText?.(JSON.stringify(sessionSettings().layout, null, 2));
  }

  return {
    applyLayoutPreset,
    applyCustomLayoutPreset,
    saveLayoutPreset,
    deleteLayoutPreset,
    resetLayoutParams,
    copyLayoutParams,
  };
}
