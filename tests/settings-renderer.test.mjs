import { test } from "node:test";
import assert from "node:assert/strict";
import { createSettingsRenderer } from "../src/ui/renderers/settings-renderer.js";

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));
const clean = (s) => String(s ?? "").trim();

function fakeEl(extra = {}) {
  return {
    value: "",
    checked: false,
    textContent: "",
    hidden: false,
    dataset: {},
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html || ""; },
    ...extra,
  };
}

function makeEls() {
  return {
    settingsPanel:    fakeEl(),
    settingsPanelTitle: fakeEl(),
    settingsPanelSubtitle: fakeEl(),
    settingsBack:     fakeEl(),
    settingsViews:    [
      Object.assign(fakeEl(), { dataset: { settingsView: "home" } }),
      Object.assign(fakeEl(), { dataset: { settingsView: "model" } }),
    ],
    providerSelect:   fakeEl(),
    providerSwitcher: fakeEl(),
    providerName:     fakeEl(),
    baseUrl:          fakeEl(),
    apiKey:           fakeEl(),
    modelInput:       fakeEl(),
    contextTokenBudget: fakeEl(),
    userNameInput:    fakeEl(),
    userAvatarPreview: fakeEl(),
    sessionBackgroundPreview: fakeEl(),
    contextCount:     fakeEl(),
    maxTokens:        fakeEl(),
    temperature:      fakeEl(),
    temperatureLabel: fakeEl(),
    unlimitedContext: fakeEl(),
    stream:           fakeEl(),
    layoutInputs:     [
      Object.assign(fakeEl(), { dataset: { layoutKey: "messageGap" } }),
    ],
    layoutValues:     [
      Object.assign(fakeEl(), { dataset: { layoutValue: "messageGap" } }),
    ],
    systemPrompt:     fakeEl(),
  };
}

test("createSettingsRenderer rejects missing ctx", () => {
  assert.throws(() => createSettingsRenderer({}), TypeError);
});

test("renderSettingsPage flips visibility on settingsViews to match active page", () => {
  const els = makeEls();
  const r = createSettingsRenderer({
    els, doc: { activeElement: null },
    ctx: { apiSettings:()=>({providers:[]}), globalModelDefaults:()=>({}), sessionSettings:()=>({layout:{}}), sessionAppearance:()=>({}), activeApiProvider:()=>null },
    settingsPageMeta: { home: { title: "首页", subtitle: "选择模块" }, model: { title: "模型", subtitle: "config" } },
    getActiveSettingsPage: () => "model",
    formatLayoutValue: (k, v) => `${k}=${v}`,
    clean, escapeHtml,
  });
  r.renderSettingsPage();
  assert.equal(els.settingsPanelTitle.textContent, "模型");
  assert.equal(els.settingsViews[0].hidden, true);
  assert.equal(els.settingsViews[1].hidden, false);
  assert.equal(els.settingsBack.hidden, false);
});

test("renderProviderSwitcher renders one button per provider with selected class", () => {
  const els = makeEls();
  const r = createSettingsRenderer({
    els, doc: null,
    ctx: {
      apiSettings: () => ({ currentProviderId: "p2", providers: [
        { id: "p1", name: "OpenAI" }, { id: "p2", name: "本地" },
      ]}),
      globalModelDefaults:()=>({}), sessionSettings:()=>({layout:{}}), sessionAppearance:()=>({}), activeApiProvider:()=>null,
    },
    settingsPageMeta: { home: { title:"H", subtitle:"" } },
    getActiveSettingsPage: () => "home",
    formatLayoutValue: () => "",
    clean, escapeHtml,
  });
  r.renderProviderSwitcher();
  assert.match(els.providerSwitcher.innerHTML, /OpenAI/);
  assert.match(els.providerSwitcher.innerHTML, /本地/);
  assert.match(els.providerSwitcher.innerHTML, /selected"[^>]*data-provider-id="p2"/);
});

test("renderSettings respects activeElement so focused inputs aren't clobbered", () => {
  const els = makeEls();
  els.providerName.value = "user typing";
  // Pretend providerName is focused.
  const fakeDoc = { activeElement: els.providerName };
  const r = createSettingsRenderer({
    els, doc: fakeDoc,
    ctx: {
      apiSettings: () => ({ providers: [{ id:"p", name:"X" }], currentProviderId:"p", baseUrl:"http://x", apiKey:"k", contextTokenBudget: 1024 }),
      globalModelDefaults: () => ({ model:"m", contextCount: 5, maxTokens: 100, temperature: 0.5, unlimitedContext: false, stream: true }),
      sessionSettings: () => ({ layout: { messageGap: 12 } }),
      sessionAppearance: () => ({ userName: "我", userAvatarDataUrl: "", backgroundDataUrl: "" }),
      activeApiProvider: () => ({ id:"p", name:"P provider" }),
    },
    settingsPageMeta: { home: { title:"H", subtitle:"" } },
    getActiveSettingsPage: () => "home",
    formatLayoutValue: (k, v) => `${k}=${v}`,
    clean, escapeHtml,
  });
  r.renderSettings();
  // providerName had focus -> renderer must NOT overwrite it.
  assert.equal(els.providerName.value, "user typing");
  // Other fields *do* get written.
  assert.equal(els.modelInput.value, "m");
  assert.equal(els.temperature.value, 0.5);
});
