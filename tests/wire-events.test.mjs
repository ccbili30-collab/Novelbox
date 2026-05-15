import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bindFilePicker,
  wireAppearanceAndImports,
  wireGlobalModelInputs,
  wireSessionFieldInputs,
  wireAssistantConfigInputs,
} from "../src/app/runtime/wire-events.js";

function makeEl() {
  const handlers = new Map();
  return {
    handlers,
    addEventListener(name, fn) { handlers.set(name, fn); },
    removeEventListener(name) { handlers.delete(name); },
    click() { handlers.get("click")?.(); },
    fire(name, payload = {}) { handlers.get(name)?.(payload); },
    value: "",
    checked: false,
    dataset: {},
  };
}

test("bindFilePicker forwards a click on the button to the file input", () => {
  let clicked = 0;
  const button = makeEl();
  const fileInput = { click: () => clicked++, addEventListener: makeEl().addEventListener };
  bindFilePicker({ button, fileInput, onChange: () => {} });
  button.click();
  assert.equal(clicked, 1);
});

test("bindFilePicker calls onChange when the file input fires change", () => {
  const button = makeEl();
  const fileInput = makeEl();
  fileInput.click = () => {};
  let changed = 0;
  bindFilePicker({ button, fileInput, onChange: () => changed++ });
  fileInput.fire("change");
  assert.equal(changed, 1);
});

test("wireAppearanceAndImports binds the 10 documented handlers safely", () => {
  const els = {
    userNameInput: makeEl(),
    chatImageFile: makeEl(),
    chooseUserAvatar: makeEl(),
    userAvatarFile: { ...makeEl(), click() {} },
    clearUserAvatar: makeEl(),
    chooseSessionBackground: makeEl(),
    sessionBackgroundFile: { ...makeEl(), click() {} },
    clearSessionBackground: makeEl(),
    bodyImportFile: makeEl(),
    sessionImportFile: makeEl(),
    creatorImportFile: makeEl(),
    globalBackupImportFile: makeEl(),
  };
  let log = [];
  wireAppearanceAndImports({ els, h: {
    updateSessionUserName: () => log.push("name"),
    handleChatImageSelected: () => log.push("img"),
    clearUserAvatar: () => log.push("clearUA"),
    handleUserAvatarSelected: () => log.push("ua"),
    clearSessionBackground: () => log.push("clearBG"),
    handleSessionBackgroundSelected: () => log.push("bg"),
    handleBodyFileSelected: () => log.push("body"),
    handleSessionImportSelected: () => log.push("sess"),
    handleCreatorImportSelected: () => log.push("creator"),
    handleGlobalBackupImportSelected: () => log.push("backup"),
  }});
  els.userNameInput.fire("input");
  els.chatImageFile.fire("change");
  els.userAvatarFile.fire("change");
  els.bodyImportFile.fire("change");
  assert.deepEqual(log, ["name", "img", "ua", "body"]);
});

test("wireAppearanceAndImports tolerates missing handler fns", () => {
  const els = {
    userNameInput: makeEl(),
    chatImageFile: makeEl(),
  };
  assert.doesNotThrow(() => wireAppearanceAndImports({ els, h: {} }));
  assert.doesNotThrow(() => els.userNameInput.fire("input"));
});

test("wireGlobalModelInputs forwards the input element to the handler", () => {
  const els = { temperature: makeEl(), unlimitedContext: makeEl(), stream: makeEl() };
  let temp = null, ctx = null, stream = null;
  wireGlobalModelInputs({ els, h: {
    onTemperatureInput: (el) => { temp = el; },
    onUnlimitedContextChange: (el) => { ctx = el; },
    onStreamChange: (el) => { stream = el; },
  }});
  els.temperature.value = "0.7";
  els.unlimitedContext.checked = true;
  els.stream.checked = false;
  els.temperature.fire("input");
  els.unlimitedContext.fire("change");
  els.stream.fire("change");
  assert.equal(temp, els.temperature);
  assert.equal(ctx, els.unlimitedContext);
  assert.equal(stream, els.stream);
});

test("wireSessionFieldInputs walks layoutInputs and novelFields arrays", () => {
  const layoutInputs = [makeEl(), makeEl(), makeEl()];
  layoutInputs[0].dataset = { layoutKey: "messageGap" };
  layoutInputs[1].dataset = { layoutKey: "messageFontSize" };
  layoutInputs[2].dataset = { layoutKey: "userBubblePadding" };
  const novelFields = [makeEl()];
  novelFields[0].dataset = { novelKey: "outline" };
  const els = { layoutInputs, novelFields, historySearch: makeEl() };
  let hits = [];
  wireSessionFieldInputs({ els, h: {
    onLayoutInput: (el) => hits.push(el.dataset.layoutKey),
    onNovelFieldInput: (el) => hits.push(`novel:${el.dataset.novelKey}`),
    onHistorySearch: () => hits.push("search"),
  }});
  layoutInputs.forEach((el) => el.fire("input"));
  novelFields.forEach((el) => el.fire("input"));
  els.historySearch.fire("input");
  assert.deepEqual(hits, ["messageGap", "messageFontSize", "userBubblePadding", "novel:outline", "search"]);
});

test("wireAssistantConfigInputs binds 5 dialog inputs", () => {
  const els = {
    assistantTemperatureInput: makeEl(),
    assistantModelInput: makeEl(),
    assistantProviderSelect: makeEl(),
    assistantApiOverrideEnabledInput: makeEl(),
  };
  let calls = [];
  wireAssistantConfigInputs({ els, h: {
    onAssistantTemperature: (el) => calls.push(["temp", el.value]),
    onAssistantModelFocus: () => calls.push("focus"),
    onAssistantModelInput: () => calls.push("modelInput"),
    onAssistantProviderChange: () => calls.push("provider"),
    onAssistantApiOverrideChange: () => calls.push("override"),
  }});
  els.assistantTemperatureInput.value = "0.5";
  els.assistantTemperatureInput.fire("input");
  els.assistantModelInput.fire("focus");
  els.assistantModelInput.fire("input");
  els.assistantProviderSelect.fire("change");
  els.assistantApiOverrideEnabledInput.fire("change");
  assert.deepEqual(calls, [["temp", "0.5"], "focus", "modelInput", "provider", "override"]);
});
