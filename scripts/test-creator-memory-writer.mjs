import assert from "node:assert/strict";
import {
  createMemoryEntriesFromMessage,
  shouldRememberMessage,
} from "../src/domain/creator/creator-memory-writer.js";

assert.equal(shouldRememberMessage({
  role: "user",
  content: "记住：我喜欢干净短句。",
}), true);

assert.equal(shouldRememberMessage({
  role: "user",
  content: "今天随便聊聊。",
}), false);

assert.equal(shouldRememberMessage({
  role: "assistant",
  content: "决定采用妹妹声音作为伏笔。",
}), false, "assistant output is not durable unless marked");

const entries = createMemoryEntriesFromMessage({
  creatorId: "creator_a",
  role: "user",
  content: "记住：这个项目的文风要干净、克制、不要废话。",
  sourceSessionId: "sess_1",
  sourceNodeId: "user_1",
  branchPathHash: "hash_1",
  createdAt: 100,
});

assert.equal(entries.length, 1);
assert.equal(entries[0].creatorId, "creator_a");
assert.equal(entries[0].scope, "session");
assert.equal(entries[0].sourceNodeId, "user_1");
assert.equal(entries[0].branchPathHash, "hash_1");
assert.equal(entries[0].type, "style");
assert.equal(entries[0].importance, 7);
assert.ok(entries[0].keywords.includes("这个项目的文风要干净"));

const durableAssistant = createMemoryEntriesFromMessage({
  creatorId: "creator_a",
  role: "assistant",
  durable: true,
  content: "确认采用妹妹声音作为伏笔。",
});
assert.equal(durableAssistant.length, 1);
assert.equal(durableAssistant[0].type, "setting");
