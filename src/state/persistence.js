import { createApiSettings, hydrateApiSettings } from "../domain/settings/api-settings.js";
import { createDefaultNovel } from "../domain/novel/novel-model.js";
import { createSession, hydrateSession } from "../domain/session/session-model.js";
import {
  CREATOR_STATE_SCHEMA_VERSION,
  createCreatorFromLegacySession,
  createCreatorIdentity,
  hydrateCreators,
} from "../domain/creator/creator-model.js";
import {
  SEALED_ROUNDTABLE_CREATORS,
  getSealedRoundtableCreatorBase,
  hydrateRoundtableState,
} from "../domain/roundtable/roundtable-model.js";
import {
  normalizeCouncilParticipationRecords,
  normalizeCreatorParticipationRecords,
} from "../domain/roundtable/council-participation-memory.js";

export const STORAGE_KEY = "tbird-chatbox-v1";

function sealedTemplateCode(id) {
  if (id === "sealed-t") return "T";
  if (id === "sealed-b") return "B";
  return "";
}

function legacyPrimaryConfig(session) {
  const rt = hydrateRoundtableState(session.roundtable || {});
  const sealed = getSealedRoundtableCreatorBase(rt.sealedCreatorId);
  const id = sealed?.id || "plot";
  return {
    roundtable: rt,
    sealedTemplate: sealed ? { ...sealed, code: sealedTemplateCode(sealed.id) } : null,
    config: rt.assistantConfigs?.[id] || {},
  };
}

function stripPrimaryFromRoundtable(session) {
  const rt = hydrateRoundtableState(session.roundtable || {});
  const primaryLikeIds = new Set(["plot", "writer", rt.sealedCreatorId, ...SEALED_ROUNDTABLE_CREATORS.map((creator) => creator.id)]);
  rt.selectedIds = Array.isArray(rt.selectedIds)
    ? rt.selectedIds.filter((id) => id && !primaryLikeIds.has(id))
    : [];
  session.roundtable = rt;
}

function ensureSessionCreator(state, session) {
  const existing = session.creatorId && state.creators?.[session.creatorId];
  if (existing) return existing;
  const { sealedTemplate, config } = legacyPrimaryConfig(session);
  const creator = createCreatorFromLegacySession(session, {
    api: state.api,
    settings: session.settings,
    sealedTemplate,
    legacyConfig: config,
  });
  state.creators[creator.id] = creator;
  session.creatorId = creator.id;
  return creator;
}

function migrateStateShape(next) {
  next.schemaVersion = Number(next.schemaVersion) || 1;
  next.creators = hydrateCreators(next.creators, {
    modelConfig: {
      providerId: next.api.currentProviderId,
      baseUrl: next.api.baseUrl,
      model: next.api.models?.[0],
      contextTokenBudget: next.api.contextTokenBudget,
    },
  });
  next.sessions.forEach((session) => {
    ensureSessionCreator(next, session);
    stripPrimaryFromRoundtable(session);
  });
  next.schemaVersion = CREATOR_STATE_SCHEMA_VERSION;
  return next;
}

export function defaultState() {
  const api = createApiSettings();
  const session = createSession();
  const creator = createCreatorIdentity({
    name: "主创",
    prompt: session.settings.systemPrompt,
    modelConfig: {
      providerId: api.currentProviderId,
      baseUrl: api.baseUrl,
      model: session.settings.model,
      temperature: session.settings.temperature,
      maxTokens: session.settings.maxTokens,
      contextTokenBudget: api.contextTokenBudget,
    },
    privateSessionId: session.id,
  });
  session.creatorId = creator.id;
  return {
    schemaVersion: CREATOR_STATE_SCHEMA_VERSION,
    activeSessionId: session.id,
    sessions: [session],
    api,
    creators: {
      [creator.id]: creator,
    },
    councilParticipationRecords: [],
    creatorParticipationRecords: [],
  };
}

export function hydrate(next) {
  const fallback = defaultState();
  next ||= fallback;
  const legacySettings = next.settings || {};
  const legacyNovel = next.novel || null;
  next.api = hydrateApiSettings(next.api || legacySettings);
  next.councilParticipationRecords = normalizeCouncilParticipationRecords(next.councilParticipationRecords);
  next.creatorParticipationRecords = normalizeCreatorParticipationRecords(next.creatorParticipationRecords);
  next.sessions = Array.isArray(next.sessions) && next.sessions.length ? next.sessions : fallback.sessions;
  next.sessions.forEach((session) => hydrateSession(session, legacySettings));
  if (!next.sessions.some((session) => session.id === next.activeSessionId)) {
    next.activeSessionId = next.sessions[0].id;
  }
  const active = next.sessions.find((session) => session.id === next.activeSessionId) || next.sessions[0];
  if (legacyNovel && active && !active.__legacyNovelMigrated) {
    active.novel = { ...createDefaultNovel(), ...(active.novel || {}), ...legacyNovel };
    active.__legacyNovelMigrated = true;
  }
  migrateStateShape(next);
  delete next.settings;
  delete next.novel;
  return next;
}

export function loadState(storage = globalThis.localStorage) {
  try {
    return hydrate(JSON.parse(storage.getItem(STORAGE_KEY) || "null"));
  } catch {
    return defaultState();
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}
