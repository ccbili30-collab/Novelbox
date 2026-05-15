import assert from "node:assert/strict";
import { createApiSettings, hydrateApiSettings } from "../src/domain/settings/api-settings.js";
import {
  applyGlobalModelConfigToAssistantConfig,
  applyGlobalModelConfigToCreator,
  applyGlobalModelConfigToSession,
  globalModelConfigFromApi,
} from "../src/domain/settings/global-model-config.js";
import { createCreatorIdentity } from "../src/domain/creator/creator-model.js";
import { createSession } from "../src/domain/session/session-model.js";

const api = createApiSettings();
api.currentProviderId = "provider_default";
api.baseUrl = "https://example.test/v1";
api.modelDefaults = {
  model: "global-model",
  temperature: 1.1,
  contextCount: 33,
  unlimitedContext: true,
  maxTokens: 4096,
  stream: false,
};
api.contextTokenBudget = 300000;

const config = globalModelConfigFromApi(hydrateApiSettings(api));
assert.equal(config.model, "global-model");
assert.equal(config.temperature, 1.1);
assert.equal(config.contextCount, 33);
assert.equal(config.unlimitedContext, true);
assert.equal(config.maxTokens, 4096);
assert.equal(config.stream, false);
assert.equal(config.contextTokenBudget, 300000);

const session = createSession("config test");
session.settings.systemPrompt = "do not expose or replace";
applyGlobalModelConfigToSession(session, config);
assert.equal(session.settings.model, "global-model");
assert.equal(session.settings.systemPrompt, "do not expose or replace");
assert.equal(session.settings.streamTouched, true);

const creator = createCreatorIdentity({
  name: "Hidden",
  prompt: "sealed prompt",
  modelConfig: { model: "old-model", maxTokens: 100 },
});
applyGlobalModelConfigToCreator(creator, config);
assert.equal(creator.prompt, "sealed prompt");
assert.equal(creator.name, "Hidden");
assert.equal(creator.modelConfig.model, "global-model");
assert.equal(creator.modelConfig.maxTokens, 4096);

const assistantConfig = {
  name: "Councilor",
  prompt: "persona prompt",
  model: "old",
  apiKey: "local secret",
};
applyGlobalModelConfigToAssistantConfig(assistantConfig, config);
assert.equal(assistantConfig.name, "Councilor");
assert.equal(assistantConfig.prompt, "persona prompt");
assert.equal(assistantConfig.model, "global-model");
assert.equal(assistantConfig.apiKey, "");
