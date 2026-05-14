import assert from "node:assert/strict";
import {
  appendCreatorParticipationRecord,
  getCreatorParticipationRecords,
} from "../src/domain/roundtable/council-participation-memory.js";

let records = [];
records = appendCreatorParticipationRecord(records, {
  creatorId: "creator-a",
  sessionId: "roundtable-1",
  summary: "本体在圆桌一的判断",
}).records;
records = appendCreatorParticipationRecord(records, {
  creatorId: "creator-a-clone",
  sessionId: "roundtable-2",
  summary: "旧版本分身在圆桌二的判断",
}).records;
records = appendCreatorParticipationRecord(records, {
  creatorId: "creator-b",
  sessionId: "roundtable-3",
  summary: "其他人的判断",
}).records;

const pooled = getCreatorParticipationRecords(records, "creator-a", {
  aliases: ["creator-a-clone"],
  limit: 20,
});

assert.deepEqual(
  pooled.map((record) => record.summary),
  ["本体在圆桌一的判断", "旧版本分身在圆桌二的判断"],
  "creator memory lookup should read the root identity and its clone aliases as one pool",
);

const isolated = getCreatorParticipationRecords(records, "creator-a", { limit: 20 });
assert.deepEqual(
  isolated.map((record) => record.summary),
  ["本体在圆桌一的判断"],
  "aliases should be opt-in so unrelated callers keep the old behavior",
);
