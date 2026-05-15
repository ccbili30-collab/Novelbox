import assert from "node:assert/strict";
import {
  appendCreatorMemoryEntry,
  createCreatorMemoryEntry,
  getActiveCreatorMemoryEntries,
  markCreatorMemoriesDeleted,
  normalizeCreatorMemory,
} from "../src/domain/creator/creator-memory-model.js";
import { createCreatorIdentity, creatorToAssistant } from "../src/domain/creator/creator-model.js";

const entry = createCreatorMemoryEntry({
  id: "mem_1",
  creatorId: "creator_a",
  scope: "session",
  sourceSessionId: "sess_1",
  sourceNodeId: "user_1",
  branchPathHash: "abc",
  type: "preference",
  text: "用户喜欢短句和冷幽默。",
  keywords: ["短句", "冷幽默", "短句"],
  importance: 99,
  createdAt: 10,
});

assert.equal(entry.scope, "session");
assert.equal(entry.type, "preference");
assert.deepEqual(entry.keywords, ["短句", "冷幽默"]);
assert.equal(entry.importance, 10, "importance is clamped to 10");

const memory = normalizeCreatorMemory({
  displayName: "A 的记忆",
  autoEnabled: false,
  compressedSnapshots: [
    { id: "legacy_1", text: "旧圆桌里确认妹妹声音是伏笔。", source: "roundtable", createdAt: 20 },
  ],
  entries: [entry],
}, { creatorId: "creator_a" });

assert.equal(memory.displayName, "A 的记忆");
assert.equal(memory.autoEnabled, false);
assert.equal(memory.compressedSnapshots.length, 1);
assert.equal(memory.entries.length, 2);
assert.equal(memory.entries.find((item) => item.id === "legacy_1").scope, "roundtable");

const appended = appendCreatorMemoryEntry(memory, {
  id: "mem_2",
  text: "主创坚持低饱和干净界面。",
  type: "style",
}, { creatorId: "creator_a" });
assert.equal(appended.entries.length, 3);

const deleted = markCreatorMemoriesDeleted(appended, (item) => item.id === "mem_1", 100);
assert.equal(deleted.entries.find((item) => item.id === "mem_1").deletedAt, 100);
assert.deepEqual(
  getActiveCreatorMemoryEntries(deleted).map((item) => item.id),
  ["legacy_1", "mem_2"],
);

const creator = createCreatorIdentity({
  id: "creator_a",
  name: "A",
  memory: deleted,
});
const assistant = creatorToAssistant(creator, {}, { model: "m", temperature: 0.8, maxTokens: 2000 });
assert.deepEqual(
  assistant.memories.map((item) => item.id),
  ["legacy_1", "mem_2"],
  "assistant view reads active normalized memory entries",
);
