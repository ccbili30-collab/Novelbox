/**
 * State context — read-only snapshot accessors over the legacy
 * `state` blob. Wraps the imperative state object behind a factory so
 * the rest of the app can be tested with a mock state, and so the
 * scattered accessors no longer reach for a module global.
 *
 * createStateContext(getState) returns a bag of helpers that all
 * close over the same state-getter. Each accessor is a thin pure
 * function that hydrates / migrates lazily, identical in behaviour
 * to the legacy main.js implementations they replace.
 */

import { hydrateApiSettings, hydrateModelDefaults } from "../../domain/settings/api-settings.js";
import { hydrateSessionSettings } from "../../domain/settings/settings-model.js";
import { createDefaultNovel } from "../../domain/novel/novel-model.js";
import { hydrateRoundtableState } from "../../domain/roundtable/roundtable-model.js";
import { clean } from "../../utils/text.js";

export function createStateContext(getState) {
  if (typeof getState !== "function") {
    throw new TypeError("createStateContext requires a getState function");
  }

  function activeSession() {
    const state = getState();
    return state.sessions.find((s) => s.id === state.activeSessionId) || state.sessions[0];
  }

  function apiSettings() {
    const state = getState();
    state.api = hydrateApiSettings(state.api);
    return state.api;
  }

  function globalModelDefaults() {
    const api = apiSettings();
    api.modelDefaults = hydrateModelDefaults(api.modelDefaults, {
      model: api.models?.[0],
      contextTokenBudget: api.contextTokenBudget,
    });
    return api.modelDefaults;
  }

  function activeApiProvider(api = apiSettings()) {
    return api.providers.find((p) => p.id === api.currentProviderId) || api.providers[0];
  }

  function syncApiFromProvider(api = apiSettings()) {
    const provider = activeApiProvider(api);
    if (!provider) return api;
    api.baseUrl = provider.baseUrl;
    api.apiKey = provider.apiKey;
    api.models = Array.from(new Set((provider.models || []).filter(Boolean)));
    return api;
  }

  function apiForProvider(providerId) {
    const api = apiSettings();
    const provider = api.providers.find((p) => p.id === providerId) || activeApiProvider(api);
    return {
      ...api,
      currentProviderId: provider?.id || api.currentProviderId,
      baseUrl: provider?.baseUrl || api.baseUrl,
      apiKey: provider?.apiKey || api.apiKey,
      models: provider?.models || api.models,
    };
  }

  function apiForAssistantConfig(config = {}) {
    const providerApi = apiForProvider(config.providerId);
    return {
      ...providerApi,
      baseUrl: providerApi.baseUrl,
      apiKey: providerApi.apiKey,
    };
  }

  function creatorsState() {
    const state = getState();
    state.creators = state.creators && typeof state.creators === "object" ? state.creators : {};
    return state.creators;
  }

  function sessionSettings(session = activeSession()) {
    session.settings = hydrateSessionSettings(session.settings);
    return session.settings;
  }

  function sessionAppearance(session = activeSession()) {
    const settings = sessionSettings(session);
    settings.appearance = {
      userName: "我",
      userAvatarDataUrl: "",
      backgroundDataUrl: "",
      ...(settings.appearance || {}),
    };
    return settings.appearance;
  }

  function sessionNovel(session = activeSession()) {
    session.novel = { ...createDefaultNovel(), ...(session.novel || {}) };
    session.novel.versions = Array.isArray(session.novel.versions)
      ? session.novel.versions.filter((v) => v && typeof v === "object" && clean(v.body))
      : [];
    return session.novel;
  }

  function roundtableState(session = activeSession()) {
    session.roundtable = hydrateRoundtableState(session.roundtable);
    return session.roundtable;
  }

  return {
    activeSession,
    apiSettings,
    globalModelDefaults,
    activeApiProvider,
    syncApiFromProvider,
    apiForProvider,
    apiForAssistantConfig,
    creatorsState,
    sessionSettings,
    sessionAppearance,
    sessionNovel,
    roundtableState,
  };
}
