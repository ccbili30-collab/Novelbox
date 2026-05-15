import assert from "node:assert/strict";
import { normalizeCreatorMemory } from "../src/domain/creator/creator-memory-model.js";
import {
  memoryQueryLooksNeeded,
  retrieveCreatorMemories,
} from "../src/domain/creator/creator-memory-retrieval.js";

const memory = normalizeCreatorMemory({
  entries: [
    {
      id: "style",
      creatorId: "creator_a",
      scope: "identity",
      type: "style",
      text: "主创偏好干净短句和克制表达。",
      keywords: ["文风", "干净"],
      importance: 4,
      createdAt: 100,
    },
    {
      id: "deleted",
      creatorId: "creator_a",
      scope: "session",
      text: "废弃分支里的妹妹声音设定。",
      deletedAt: 200,
      createdAt: 100,
    },
    {
      id: "round",
      creatorId: "creator_a",
      scope: "roundtable",
      sourceSessionId: "sess_2",
      sourceRoundtableId: "sess_2",
      text: "话题：第二章；确认采用妹妹声音作为伏笔。",
      keywords: ["妹妹", "伏笔"],
      importance: 5,
      createdAt: 300,
    },
  ],
}, { creatorId: "creator_a" });

assert.equal(memoryQueryLooksNeeded("你还记得以前的文风吗"), true);
assert.equal(memoryQueryLooksNeeded("天气不错"), false);

const style = retrieveCreatorMemories(memory, "继续保持干净文风", {
  includeRecent: false,
  now: 500,
  limit: 2,
});
assert.equal(style[0].id, "style");
assert.equal(style.some((item) => item.id === "deleted"), false);

const recent = retrieveCreatorMemories(memory, "", {
  includeRecent: true,
  now: 500,
  sessionId: "sess_2",
});
assert.equal(recent[0].id, "round", "same session and important recent roundtable memory ranks first");

const activeOnly = retrieveCreatorMemories(memory, "妹妹伏笔", {
  includeRecent: false,
  isActiveMemory: (entry) => entry.id !== "round",
});
assert.equal(activeOnly.some((item) => item.id === "round"), false);
