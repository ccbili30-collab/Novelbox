import assert from "node:assert/strict";
import {
  appendCreatorParticipationRecord,
  createMemoryFromParticipationRecord,
} from "../src/domain/roundtable/council-participation-memory.js";

const result = appendCreatorParticipationRecord([], {
  id: "record_1",
  creatorId: "creator_a",
  sessionId: "sess_1",
  roundtableMessageId: "round_1",
  topic: "第二章转折",
  summary: "确认采用妹妹声音作为伏笔。",
  content: "确认采用妹妹声音作为伏笔。",
  createdAt: 100,
});

assert.equal(result.records.length, 1);
const memory = createMemoryFromParticipationRecord(result.record);
assert.equal(memory.id, "memory_record_1");
assert.equal(memory.creatorId, "creator_a");
assert.equal(memory.scope, "roundtable");
assert.equal(memory.sourceSessionId, "sess_1");
assert.equal(memory.sourceRoundtableId, "sess_1");
assert.equal(memory.sourceRecordId, "record_1");
assert.equal(memory.type, "decision");
assert.equal(memory.text, "话题：第二章转折；确认采用妹妹声音作为伏笔。");

assert.equal(createMemoryFromParticipationRecord({ creatorId: "", sessionId: "s", content: "x" }), null);
