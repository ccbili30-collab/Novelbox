import assert from "node:assert/strict";
import { createRoundtableController } from "../src/app/roundtable-controller.js";
import { clean } from "../src/utils/text.js";

globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);

const currentSession = {
  id: "session_current",
  creatorId: "creator_current",
  roundtable: {
    selectedIds: [],
    assistantConfigs: {},
    contextOptions: {},
  },
};
const sourceSession = {
  id: "session_source",
  title: "source",
  creatorId: "creator_source",
  roundtable: {
    selectedIds: ["creator_guest"],
    assistantConfigs: {},
    contextOptions: {},
  },
};
const state = {
  sessions: [currentSession, sourceSession],
  creators: {
    creator_current: { id: "creator_current", name: "Current", memory: { compressedSnapshots: [] } },
    creator_source: { id: "creator_source", name: "Source", memory: { compressedSnapshots: [] } },
    creator_guest: { id: "creator_guest", name: "Guest", memory: { compressedSnapshots: [] } },
  },
};

const roundtableState = (session = currentSession) => {
  session.roundtable ||= {};
  session.roundtable.selectedIds ||= [];
  session.roundtable.assistantConfigs ||= {};
  session.roundtable.contextOptions ||= {};
  return session.roundtable;
};

const getCreatorIdentity = (id) => state.creators[id] || null;
const getPrimaryCreatorId = (session = currentSession) => session.creatorId;
const getRoundAssistantFromSession = (session, id) => {
  const creator = getCreatorIdentity(id);
  if (!creator) return null;
  return {
    id: creator.id,
    name: creator.name,
    prompt: creator.prompt || "",
    memories: creator.memory?.compressedSnapshots || [],
  };
};

let savedCount = 0;
const controller = createRoundtableController({
  getState: () => state,
  activeSession: () => currentSession,
  activePath: () => [],
  roundtableState,
  sessionNovel: () => ({}),
  sessionSettings: () => ({ model: "model", maxTokens: 1000, temperature: 0.7, stream: false }),
  apiSettings: () => ({ currentProviderId: "", baseUrl: "", apiKey: "", contextTokenBudget: 200000 }),
  apiForProvider: () => ({ baseUrl: "", apiKey: "" }),
  getRoundAssistantFromSession,
  getRoundAssistantBase: () => null,
  getPrimaryCreatorId,
  getRoundAssistantBases: () => [],
  getCreatorIdentity,
  getMessageContent: (node) => node?.content || "",
  getMainSystemPrompt: () => "",
  buildNovelMemoryFromSession: () => "",
  getCreatorMemorySnippets: () => [],
  getRoundtableMentionableAssistants: () => [],
  getRoundtableManuscript: () => "",
  getNovelSourceText: () => "",
  getAssistantContextTokenThreshold: () => 200000,
  getRoundAssistant: (id) => getRoundAssistantFromSession(currentSession, id),
  moveRoundtableMentionsAfter: () => [],
  parseRoundtableMentions: () => [],
  buildAssistantMentionInstruction: () => "",
  addAssistantRoundtableReply: async () => null,
  cleanRoundtableAssistantOutput: clean,
  uniqueRoundAssistantName: (name) => name,
  saveCreatorIdentity: (creator) => {
    savedCount += 1;
    state.creators[creator.id] = creator;
    return creator;
  },
  normalizeAssistantPrivateMessages: (messages = []) => messages,
  rememberCreatorRoundtableJoin: () => null,
  isSealedRoundtableCreatorId: () => false,
  assistantConfigHasSavedIdentity: () => false,
  callCompressionModel: async () => "compressed source memory",
  ensureAutoCompressNovelMemory: async () => {},
  callOpenAITextStreamWithSettings: async () => ({ text: "" }),
  callOpenAITextWithSettings: async () => ({ text: "" }),
  streamAssistantRoundtableReply: async () => ({ text: "" }),
  addRoundtableFailureMessage: () => {},
  setRoundtableActiveSpeaker: () => {},
  getRoundtableActiveSpeaker: () => null,
  syncPrimaryCreatorIntoRoundtable: () => {},
  refreshWriterStyleCacheWithAi: async () => {},
  closePanels: () => {},
  render: () => {},
  resizeInput: () => {},
  touchSession: () => {},
  persistState: () => {},
  showToast: () => {},
  pushTransientHistory: () => {},
  getTransientHistoryOpen: () => false,
  setTransientHistoryOpen: () => {},
  resetActiveMenus: () => {},
  clean,
  titleForSession: (session) => session.title || session.id,
  uid: (prefix = "id") => `${prefix}_test`,
  humanizeError: (error) => error.message,
});

await controller.importMemberFromSession("session_source", "creator_guest");

assert.deepEqual(Object.keys(state.creators).sort(), ["creator_current", "creator_guest", "creator_source"]);
assert.deepEqual(currentSession.roundtable.selectedIds, ["creator_guest"]);
assert.equal(savedCount, 1);
const memory = state.creators.creator_guest.memory.compressedSnapshots[0];
assert.equal(memory.text, "compressed source memory");
assert.equal(memory.sourceSessionId, "session_source");
assert.equal(memory.sourceCreatorId, "creator_guest");

await controller.importMemberFromSession("session_source", "creator_source");

assert.deepEqual(Object.keys(state.creators).sort(), ["creator_current", "creator_guest", "creator_source"]);
assert.deepEqual(currentSession.roundtable.selectedIds, ["creator_guest", "creator_source"]);
assert.equal(savedCount, 2);
const sourceMemory = state.creators.creator_source.memory.compressedSnapshots[0];
assert.equal(sourceMemory.sourceSessionId, "session_source");
assert.equal(sourceMemory.sourceCreatorId, "creator_source");
assert.equal(currentSession.roundtable.assistantConfigs.creator_source.importedFrom.reference, true);
assert.equal(currentSession.roundtable.assistantConfigs.creator_source.importedFrom.clone, undefined);
