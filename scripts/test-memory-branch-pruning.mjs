import assert from "node:assert/strict";
import { createSession } from "../src/domain/session/session-model.js";
import {
  activatePathToNode,
  activePath,
  addChild,
  createNode,
  getNode,
} from "../src/domain/session/session-tree.js";
import {
  branchPathHashForNode,
  isMemoryOnActiveBranch,
  pruneAbandonedBranchMemories,
} from "../src/domain/session/branch-signature.js";
import { normalizeCreatorMemory } from "../src/domain/creator/creator-memory-model.js";

function assistant(parentId, content = "") {
  const node = createNode("assistant", parentId, content);
  node.activeVersionId = node.versions[0].id;
  return node;
}

const session = createSession("memory branch test");
const root = getNode(session, session.rootId);
const firstUser = createNode("user", root.id, "first request");
addChild(session, root, firstUser);
const oldAssistant = assistant(firstUser.id, "old answer");
addChild(session, firstUser, oldAssistant);
const followUser = createNode("user", oldAssistant.id, "remember this old branch");
addChild(session, oldAssistant, followUser);
const followAssistant = assistant(followUser.id, "old branch memory");
addChild(session, followUser, followAssistant);

assert.deepEqual(
  activePath(session).map((node) => node.id),
  [firstUser.id, oldAssistant.id, followUser.id, followAssistant.id],
);

const memory = normalizeCreatorMemory({
  entries: [
    {
      id: "old_branch_memory",
      creatorId: "creator_a",
      scope: "session",
      sourceNodeId: followAssistant.id,
      branchPathHash: branchPathHashForNode(session, followAssistant.id),
      text: "旧分支里决定妹妹声音是伏笔。",
      type: "decision",
    },
    {
      id: "identity_memory",
      creatorId: "creator_a",
      scope: "identity",
      text: "主创偏好干净短句。",
      type: "style",
    },
  ],
}, { creatorId: "creator_a" });

assert.equal(isMemoryOnActiveBranch(session, memory.entries[0]), true);

activatePathToNode(session, firstUser.id);
const newAssistant = assistant(firstUser.id, "new answer");
addChild(session, firstUser, newAssistant);

assert.deepEqual(
  activePath(session).map((node) => node.id),
  [firstUser.id, newAssistant.id],
);
assert.equal(isMemoryOnActiveBranch(session, memory.entries[0]), false);

const pruned = pruneAbandonedBranchMemories(memory, session, 1234);
assert.equal(pruned.entries.find((entry) => entry.id === "old_branch_memory").deletedAt, 1234);
assert.equal(pruned.entries.find((entry) => entry.id === "identity_memory").deletedAt, 0);
