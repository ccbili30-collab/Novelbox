import assert from "node:assert/strict";
import { createCreatorController } from "../src/app/creator-controller.js";
import { clean } from "../src/utils/text.js";

const state = {
  creators: {
    creator_a: {
      id: "creator_a",
      name: "A",
      memory: {
        entries: [
          {
            id: "mem_record_1",
            creatorId: "creator_a",
            scope: "roundtable",
            sourceRecordId: "record_1",
            type: "summary",
            text: "record memory",
            createdAt: 10,
            updatedAt: 10,
          },
          {
            id: "mem_other",
            creatorId: "creator_a",
            scope: "roundtable",
            sourceRecordId: "record_2",
            type: "summary",
            text: "other memory",
            createdAt: 11,
            updatedAt: 11,
          },
        ],
      },
    },
  },
  creatorParticipationRecords: [
    {
      id: "record_1",
      creatorId: "creator_a",
      sessionId: "session_1",
      summary: "roundtable record",
      content: "roundtable record",
      createdAt: 10,
      updatedAt: 10,
    },
  ],
};

let rendered = false;
let persisted = false;

const controller = createCreatorController({
  getState: () => state,
  getCreatorIdentity: (id) => state.creators[id] || null,
  getPrimaryCreatorId: () => "creator_a",
  creatorsState: () => state.creators,
  saveCreatorIdentity: (creator) => {
    state.creators[creator.id] = creator;
    return creator;
  },
  ensureSessionCreator: () => null,
  roundtableState: () => ({ selectedIds: [], assistantConfigs: {} }),
  switchSession: () => {},
  closePanels: () => {},
  render: () => { rendered = true; },
  persistState: () => { persisted = true; },
  touchSession: () => {},
  clean,
  showToast: () => {},
  askDeleteChoice: async () => "cancel",
});

controller.deleteCreatorRecord("record_1");

assert.equal(state.creatorParticipationRecords[0].deleted, true);
assert.ok(state.creators.creator_a.memory.entries.find((entry) => entry.id === "mem_record_1").deletedAt > 0);
assert.equal(state.creators.creator_a.memory.entries.find((entry) => entry.id === "mem_other").deletedAt, 0);
assert.equal(rendered, true);
assert.equal(persisted, true);
