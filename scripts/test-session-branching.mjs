import assert from "node:assert/strict";
import { createSession } from "../src/domain/session/session-model.js";
import {
  activatePathToNode,
  activePath,
  addChild,
  createNode,
  getNode,
} from "../src/domain/session/session-tree.js";

function assistant(parentId, content = "") {
  const node = createNode("assistant", parentId, content);
  node.activeVersionId = node.versions[0].id;
  return node;
}

const session = createSession("branch test");
const root = getNode(session, session.rootId);
const firstUser = createNode("user", root.id, "first request");
addChild(session, root, firstUser);
const oldAssistant = assistant(firstUser.id, "old answer");
addChild(session, firstUser, oldAssistant);
const followUser = createNode("user", oldAssistant.id, "old follow-up");
addChild(session, oldAssistant, followUser);
const followAssistant = assistant(followUser.id, "old lower branch");
addChild(session, followUser, followAssistant);

assert.deepEqual(
  activePath(session).map((node) => node.id),
  [firstUser.id, oldAssistant.id, followUser.id, followAssistant.id],
);

activatePathToNode(session, firstUser.id);
const resendAssistant = assistant(firstUser.id, "new answer");
addChild(session, firstUser, resendAssistant);

assert.deepEqual(
  activePath(session).map((node) => node.id),
  [firstUser.id, resendAssistant.id],
  "resending from an old user message must cut the visible/request path after the new assistant branch",
);

assert.ok(
  getNode(session, followAssistant.id),
  "the abandoned lower branch should still exist in the tree",
);

activatePathToNode(session, followAssistant.id);
assert.deepEqual(
  activePath(session).map((node) => node.id),
  [firstUser.id, oldAssistant.id, followUser.id, followAssistant.id],
  "the old lower branch should remain recoverable by branch switching",
);
