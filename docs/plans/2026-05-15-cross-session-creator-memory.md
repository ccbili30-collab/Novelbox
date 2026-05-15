# Cross-Session Creator Memory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a creator-centered memory system where private chats, main chat, roundtables, and invited variants can remember and retrieve relevant experiences without mixing unrelated session memory.

**Architecture:** Creator identity is the long-lived person; sessions and roundtables are contexts under that person. Memory entries carry source metadata so branch rollback, deleted records, hidden templates, and per-roundtable participation can be pruned or queried without corrupting the creator profile.

**Tech Stack:** Vanilla JS modules, localStorage persisted state, Android WebView asset bundle, existing session tree and roundtable controllers.

---

## Approved Product Rules

1. Automatic memory is allowed, with a user-facing off switch later.
2. User messages can become memory when relevant.
3. Roundtable records are all stored; only key changes are distilled into long-term memory.
4. Original history is retained; summaries are indexes, not destructive compression.
5. Invited variants write into their own session/roundtable memory pool, not into the source creator's main chat memory.
6. A variant can influence the creator through memory, but does not rewrite the system prompt.
7. Hidden creators behave like normal creators except prompt visibility/export masking.
8. Delete flows must offer: cancel, delete, delete-but-keep-creator/session depending on target.
9. Deleting a participation record makes that creator forget that experience and any derived memory.
10. Abandoned branches are forgotten; only the active branch can create durable memory.
11. A compact "referenced memories" UI is acceptable for debugging and user trust.
12. First implementation uses local keyword/time/session relation retrieval, not embeddings.
13. Attachments are current-turn context only unless explicitly remembered or distilled as key setting.
14. Workspace files are project/session material, not creator memory.
15. Global model defaults affect new creators only unless the user presses full coverage.
16. "Creators" page is 3-level: list -> creator detail -> memory/roundtable detail.
17. Roundtable-created councilors stay local seats until private chat opens a creator session.
18. Writer is not an independent creator and has no long-term memory.
19. Compress at round end and when switching/leaving a roundtable if needed.
20. Keep migration simple; old test data may be discarded when necessary.

## Memory Model

### Task 1: Add Explicit Memory Types

**Files:**
- Modify: `D:/CodexW/TBird_Novelbox/src/domain/creator/creator-model.js`
- Create: `D:/CodexW/TBird_Novelbox/src/domain/creator/creator-memory-model.js`
- Test: `D:/CodexW/TBird_Novelbox/scripts/test-creator-memory-model.mjs`

**Steps:**
1. Define memory entry fields:
   - `id`
   - `creatorId`
   - `scope`: `identity | session | roundtable | private`
   - `sourceSessionId`
   - `sourceRoundtableId`
   - `sourceNodeId`
   - `sourceRecordId`
   - `branchPathHash`
   - `type`: `preference | setting | relationship | style | decision | warning | attachment | summary`
   - `text`
   - `keywords`
   - `importance`
   - `createdAt`
   - `updatedAt`
   - `deletedAt`
2. Keep existing `creator.memory.compressedSnapshots` readable during migration.
3. Store new memory as `creator.memory.entries`.
4. Write tests for normalization, legacy snapshot migration, deletion marker behavior.

### Task 2: Track Memory Source Branch

**Files:**
- Modify: `D:/CodexW/TBird_Novelbox/src/domain/session/session-tree.js`
- Create: `D:/CodexW/TBird_Novelbox/src/domain/session/branch-signature.js`
- Test: `D:/CodexW/TBird_Novelbox/scripts/test-memory-branch-pruning.mjs`

**Steps:**
1. Add helper to compute active branch path hash from current session node chain.
2. When creating memory from a user/assistant node, attach `sourceNodeId` and `branchPathHash`.
3. Add helper `isMemoryOnActiveBranch(session, memory)`.
4. Add pruning helper that marks abandoned-branch memory deleted when branch changes after resend/regenerate/edit.
5. Test that old lower branch memory becomes inactive after user resends from an earlier node.

## Memory Writing

### Task 3: Add Memory Writer

**Files:**
- Create: `D:/CodexW/TBird_Novelbox/src/domain/creator/creator-memory-writer.js`
- Modify: `D:/CodexW/TBird_Novelbox/src/main.js`
- Test: `D:/CodexW/TBird_Novelbox/scripts/test-creator-memory-writer.mjs`

**Steps:**
1. Implement cheap heuristic extraction:
   - explicit "记住/以后/设定/规则/偏好/不要/总是"
   - user corrections
   - roundtable decisions/adoptions
   - style preferences
2. Save user messages when relevant.
3. Save assistant messages only when adopted, approved, or clearly durable.
4. Never write writer output as independent writer memory.
5. Respect future `memory.autoEnabled` switch, default enabled.

### Task 4: Roundtable Participation Distillation

**Files:**
- Modify: `D:/CodexW/TBird_Novelbox/src/domain/roundtable/council-participation-memory.js`
- Modify: `D:/CodexW/TBird_Novelbox/src/app/roundtable-controller.js`
- Test: `D:/CodexW/TBird_Novelbox/scripts/test-roundtable-memory-distillation.mjs`

**Steps:**
1. Every roundtable message remains in participation records.
2. At round end, distill important changes into that creator's `roundtable` scoped memory.
3. For invited variants, use `sourceCreatorId` plus `sourceSessionId`, but store memory under the invited context pool.
4. Deleting the participation record deletes derived memory via `sourceRecordId`.

## Memory Retrieval

### Task 5: Build Local Retrieval

**Files:**
- Create: `D:/CodexW/TBird_Novelbox/src/domain/creator/creator-memory-retrieval.js`
- Modify: `D:/CodexW/TBird_Novelbox/src/main.js`
- Modify: `D:/CodexW/TBird_Novelbox/src/app/roundtable-controller.js`
- Test: `D:/CodexW/TBird_Novelbox/scripts/test-creator-memory-retrieval.mjs`

**Steps:**
1. Tokenize Chinese/English text using simple substring and keyword matching.
2. Score by keyword overlap, same session, same roundtable, recency, importance.
3. Exclude deleted memories and abandoned branch memories.
4. Return top 6-10 snippets depending on context budget.
5. Add debug payload listing selected memory IDs.

### Task 6: Inject Memory Into Prompts

**Files:**
- Modify: `D:/CodexW/TBird_Novelbox/src/main.js`
- Modify: `D:/CodexW/TBird_Novelbox/src/app/roundtable-controller.js`
- Modify: `D:/CodexW/TBird_Novelbox/src/domain/roundtable/roundtable-context-builder.js`

**Steps:**
1. Main chat injects identity + active session memory.
2. Roundtable injects identity + current roundtable memory + relevant other-roundtable snippets.
3. Invited variants inject variant context, source creator summary, and current roundtable memory separately.
4. Do not inject abandoned branch memory.
5. Keep "referenced memories" metadata for UI.

## Identity And UI

### Task 7: Fix Creator/Variant Identity Boundaries

**Files:**
- Modify: `D:/CodexW/TBird_Novelbox/src/domain/roundtable/roundtable-model.js`
- Modify: `D:/CodexW/TBird_Novelbox/src/app/assistant-controller.js`
- Modify: `D:/CodexW/TBird_Novelbox/src/app/creator-controller.js`

**Steps:**
1. A roundtable-created local councilor remains local until private chat is opened.
2. Opening private chat promotes it to full creator identity.
3. Main creator is never removable from its own session.
4. Switching communication/roundtable mode never creates a new main creator.

### Task 8: Creators Page Memory Views

**Files:**
- Modify: `D:/CodexW/TBird_Novelbox/src/main.js`
- Modify: `D:/CodexW/TBird_Novelbox/src/styles/components.css`

**Steps:**
1. First level: creator list.
2. Second level: creator config, memory summary, private sessions, roundtable list.
3. Third level: specific memory pool or participation record details.
4. Remove long participation text from the assistant settings dialog.
5. Add delete actions that prune derived memory.

### Task 9: Referenced Memory UI

**Files:**
- Modify: `D:/CodexW/TBird_Novelbox/src/main.js`
- Modify: `D:/CodexW/TBird_Novelbox/src/styles/components.css`

**Steps:**
1. Add compact collapsed "参考记忆" under AI messages when memory was used.
2. Show memory display name, source session title, and short text.
3. Do not expose hidden creator prompts.

## Compression And Cleanup

### Task 10: Compression Hooks

**Files:**
- Modify: `D:/CodexW/TBird_Novelbox/src/app/roundtable-controller.js`
- Modify: `D:/CodexW/TBird_Novelbox/src/app/writer-controller.js`

**Steps:**
1. On round end, compress current roundtable state into scoped memory if changed.
2. On roundtable switch/leave, compress if pending.
3. Writer only inherits style cache; no writer identity memory.
4. Keep original records unless the user deletes them.

### Task 11: Delete And Forget

**Files:**
- Modify: `D:/CodexW/TBird_Novelbox/src/main.js`
- Modify: `D:/CodexW/TBird_Novelbox/src/app/creator-controller.js`
- Modify: `D:/CodexW/TBird_Novelbox/src/domain/creator/creator-memory-model.js`

**Steps:**
1. Delete participation record -> delete derived memories.
2. Delete session -> offer cancel/delete/delete-but-keep-creator.
3. Delete creator -> offer cancel/delete/delete-but-keep-session.
4. Branch rollback/resend -> mark abandoned branch memories deleted.

## Verification

### Task 12: Regression Suite

**Files:**
- Create/Update scripts under `D:/CodexW/TBird_Novelbox/scripts/`

**Commands:**
- `node --check src/main.js`
- `node scripts/test-creator-memory-model.mjs`
- `node scripts/test-memory-branch-pruning.mjs`
- `node scripts/test-creator-memory-writer.mjs`
- `node scripts/test-roundtable-memory-distillation.mjs`
- `node scripts/test-creator-memory-retrieval.mjs`
- `node scripts/test-session-branching.mjs`
- `node scripts/test-global-model-config.mjs`
- `cd android-app && .\gradlew.bat assembleDebug --offline --no-daemon`

---

## Final Product Decisions

1. Automatic memory switch is per creator/session from the start, default enabled.
2. Local roundtable councilor memories are exported with the session package even before that councilor is promoted to a full creator.
3. If an invited variant learns something important in another roundtable, the source creator can see it by default through retrieval as other-roundtable memory.
4. Hidden creators show normal memory text in referenced-memory UI; only built-in/sealed system prompts stay hidden.
5. Image attachments do not create memory from model interpretation. Only user text or durable textual decisions can become memory.
