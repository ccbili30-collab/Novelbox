import { createApiSettings, hydrateApiSettings } from "../domain/settings/api-settings.js";
import { createDefaultNovel } from "../domain/novel/novel-model.js";
import { createSession, hydrateSession } from "../domain/session/session-model.js";

export const STORAGE_KEY = "tbird-chatbox-v1";

export function defaultState() {
  const session = createSession();
  return {
    activeSessionId: session.id,
    sessions: [session],
    api: createApiSettings(),
  };
}

export function hydrate(next) {
  const fallback = defaultState();
  next ||= fallback;
  const legacySettings = next.settings || {};
  const legacyNovel = next.novel || null;
  next.api = hydrateApiSettings(next.api || legacySettings);
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
