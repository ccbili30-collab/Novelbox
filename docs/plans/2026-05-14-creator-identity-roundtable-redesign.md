# Creator Identity and Roundtable Redesign

Date: 2026-05-14

Status: In progress

## Goal

TBird / Novelbox is moving from a Chatbox-inspired session model to a creator-centered writing system.

The important product rule is simple:

> A session has exactly one primary creator. Chat mode and roundtable mode are two views of the same creator, not two different assistants.

The roundtable is a meeting UI layered on top of the current session. It adds council participants and a writer tool, but it must not replace, clone, delete, or reinterpret the current session's primary creator.

## Product Invariants

1. A session has one primary creator, one writer tool, and zero or more council participants.
2. The user talks to the primary creator in chat mode.
3. Roundtable mode keeps the same primary creator and the same session memory. Only the UI and visible context change.
4. The primary creator is not a council participant. It is always present in roundtable mode and cannot be unchecked or deleted from that session.
5. Council participants are creator identities. They can join multiple roundtables and can be opened as private chats.
6. The writer is not a creator identity. It is a per-session tool that inherits the primary creator's model/API by default and only writes prose when asked.
7. Hidden creators are templates, not permanent special identities. Applying a hidden template creates a normal creator identity with a sealed template marker.
8. APK updates must not lose sessions. Large state changes require automatic schema migration.

## Data Model

### Global State

Add a first-class creator identity registry:

```js
state = {
  schemaVersion: number,
  api: ApiSettings,
  creators: {
    [creatorId]: CreatorIdentity
  },
  sessions: Session[],
  creatorParticipationRecords: CreatorParticipationRecord[]
}
```

### Creator Identity

```js
CreatorIdentity = {
  id: string,
  kind: "creator",
  name: string,
  avatarDataUrl: string,
  sourceTemplateId: string,      // e.g. "sealed-t", "sealed-b", "socrates"; empty for normal creators
  sealedTemplateCode: string,    // e.g. "T", "B"; used for import/export template remapping
  prompt: string,                // hidden in UI/export when sourceTemplateId is sealed
  activationProfile: string,
  modelConfig: {
    providerId: string,
    baseUrl: string,
    model: string,
    temperature: number,
    maxTokens: number,
    contextTokenBudget: number   // default comes from global model config, initially 200k
  },
  memory: {
    displayName: string,
    notes: string,
    compressedSnapshots: CreatorMemorySnapshot[]
  },
  privateSessionId: string,
  createdAt: number,
  updatedAt: number
}
```

API keys are never stored on exported creator/session packages. Runtime API keys come from local provider settings.

### Session

```js
Session = {
  id: string,
  creatorId: string,
  writerState: WriterState,
  roundtable: RoundtableState,
  nodes: SessionTree,
  activeNodeId: string,
  settings: SessionSettings,
  appearance: SessionAppearance,
  novel: NovelData,
  workspace: WorkspaceState,
  createdAt: number,
  updatedAt: number
}
```

`session.creatorId` is the only source of truth for the session primary creator.

### Roundtable State

```js
RoundtableState = {
  enabled: boolean,
  selectedParticipantIds: string[],  // council participants only, never the primary creator
  memberOrder: string[],
  membersOpen: boolean,
  materialsOpen: boolean,
  messages: RoundtableMessage[],
  contextOptions: RoundtableContextOptions,
  paperReveal: number,
  paperScrollTop: number
}
```

Current code that treats `roundtable.selectedIds[0]` or `plot` as the primary creator must be removed.

### Writer State

```js
WriterState = {
  styleCache: string,
  styleCacheUpdatedAt: number,
  styleCacheSourceHash: string,
  inheritingStyle: boolean,
  modelOverride: Partial<ModelConfig>
}
```

The writer defaults to the session primary creator model/API. It can have a session-local model override later, but it is not a creator identity and has no cross-session memory.

## Mode Behavior

### Chat Mode

The user talks to `session.creatorId`.

Prompt construction uses:

1. creator prompt / sealed template prompt
2. creator activation profile
3. current active session path only
4. current active assistant version only
5. novel materials selected for the session
6. memory lookup only when explicitly requested or detected as needed

Deleted nodes, inactive branches, and inactive AI versions are ignored.

### Roundtable Mode

Entering roundtable mode:

1. keeps `session.creatorId` unchanged
2. shows the same primary creator as fixed meeting host/participant
3. shows selected council participants from `roundtable.selectedParticipantIds`
4. starts or refreshes writer style inheritance in the background
5. uses existing writer style cache immediately if available
6. displays "正在继承文风" only when no usable cache exists

Leaving roundtable mode does not change the primary creator.

### Writer Tool

The writer is a prose execution tool:

1. It appears only in roundtable mode.
2. It reads the primary creator's style, current active chat path, manuscript, novel materials, and roundtable context.
3. It produces a compressed style prompt and stores it in `session.writerState.styleCache`.
4. It does not speak unless the user or the roundtable explicitly addresses the writer.
5. It follows orders such as continue, rewrite, polish, adopt, or organize prose.

## Creator Templates

Templates initialize creator identities.

Visible templates may show and export their prompt. Sealed templates do not show prompt text and do not export prompt text.

Applying template `T` in two sessions creates two independent creator identities. They share the initial template, not memory or configuration.

Exporting a creator made from a sealed template writes a code such as:

```js
{
  sourceTemplateId: "sealed-t",
  sealedTemplateCode: "T"
}
```

Importing uses the local template registry to restore the prompt by code. If the local app lacks that template, the import can preserve visible configuration and memory but must mark the creator as missing its sealed template.

This is a template remapping mechanism, not real cryptographic secrecy.

## Creator Configuration

Configuration layers:

1. global model config
2. creator identity override
3. optional session-local writer override

Global config provides default provider, base URL, model list, temperature, max output, and context token budget. The default context token budget is 200k.

Creator identity overrides apply to ordinary creators, council members, and creators instantiated from sealed templates.

Hidden/sealed template creators must also have API/model/context-budget controls in their visible configuration UI.

## Creators Page

Add a fourth settings page named `创作者们`.

This page is a full lifecycle console for creator identities, not a lightweight member list.

It should manage:

1. all primary creators and council identities
2. visible configuration
3. API/model/context budget overrides
4. avatar and display name
5. activation profile
6. memory library display names and notes
7. sessions/private chats attached to the identity
8. roundtables where the identity appears
9. import/export
10. layered deletion

Deletion levels:

1. remove from a roundtable
2. delete a participation record
3. delete an attached session
4. delete the whole creator identity, including attached sessions and roundtable references

Destructive outer-level deletion requires explicit confirmation.

## Private Chat Behavior

Clicking private chat for a council identity:

1. opens its existing private session by default
2. creates a new session only when no private session exists
3. sets the new session's `creatorId` to that identity
4. keeps future private chats on that same session unless the user explicitly creates another one later

Creating a new council member in a roundtable also creates a creator identity. Private chatting with that member opens or creates its creator session.

## Pulling Creators Into Other Roundtables

Pulling a creator into another roundtable creates a seat reference, not a fake assistant.

The pulled creator:

1. keeps the same identity ID when inside the same local app
2. keeps the same visible configuration and model/API override
3. can query its original session memory
4. can query its participation records in other roundtables
5. creates a new participation record for the target roundtable

If the creator is exported/imported as part of a session package, the imported copy receives new local IDs and is no longer live-synced to the original app instance.

## Memory Rules

Primary creator memory is not eagerly compressed just because it exists.

In the creator's own session, prompt building should prefer the current active path until it exceeds the creator's context token budget. When the budget is exceeded, older content can be summarized for prompt construction, but the original session tree remains intact.

Compression is primarily for:

1. cross-session identity continuity
2. pulled creators remembering their origin
3. private-chat creation from council members
4. import/export packages
5. context overflow fallback

Memory must follow the current valid state:

1. only current active branch
2. only active AI output version
3. no deleted messages
4. no abandoned branches
5. no deleted roundtable messages

Old branches and old versions are ignored for memory. Manual "include old branch" is out of scope for now.

The memory library UI can edit user-visible names, labels, or notes, but not raw internal memory content.

## Participation Records

A participation record belongs to a creator identity and a context.

```js
CreatorParticipationRecord = {
  id: string,
  creatorId: string,
  sessionId: string,
  roundtableMessageIds: string[],
  displayName: string,
  topic: string,
  summary: string,
  sourceRefs: SourceRef[],
  deleted: boolean,
  createdAt: number,
  updatedAt: number
}
```

Deleting a council seat does not delete the participation record. The creator can still remember having joined that roundtable.

Deleting the participation record makes the creator forget that roundtable context unless it still exists elsewhere in an active session path.

## Session Import and Export

Add export/import controls to history sessions.

Exporting a session creates a structured package containing:

1. session tree and active branch state
2. session primary creator identity
3. writer state and style cache
4. roundtable state and selected participant identities
5. current-session participation records
6. novel data
7. appearance, layout, and workspace metadata
8. provider name, base URL, model name, context token budget, temperature, and max output

Export never includes API keys.

Default export does not include unrelated external memory libraries. It includes only what is needed to restore the exported session room. Imported sessions always become new copies with new IDs and titles marked as imported.

Import never overwrites existing sessions or creators.

## State Migration

Add `state.schemaVersion`.

On startup:

1. load existing local state
2. run deterministic migrations in order
3. create creator identities for old sessions without `creatorId`
4. migrate old `roundtable.sealedCreatorId` into a creator identity sourced from a sealed template
5. migrate old `plot` or primary assistant config into the session creator
6. remove primary creator IDs from roundtable selected participants
7. migrate writer-related settings into `session.writerState`
8. preserve old data in a temporary legacy backup when practical
9. save only after migration succeeds

APK updates must not clear local storage.

## Implementation Checklist

| Done | Order | Work item | Current note |
| --- | ---: | --- | --- |
| ✅ | 1 | Add schema version and creator identity domain model. | Added `state.creators`, `session.creatorId`, creator model config, creator memory, and writer state. |
| ✅ | 2 | Implement migration from current session/roundtable shape. | Existing sessions receive creator identities; legacy primary/hidden creator state is migrated. |
| ✅ | 3 | Replace primary creator resolution with `session.creatorId`. | Chat mode and roundtable mode now resolve the same primary creator. |
| ✅ | 4 | Split roundtable participants from the primary creator. | `roundtable.selectedIds` is council participants only; primary creator is fixed by session. |
| ✅ | 5 | Convert sealed creators from locked identities into sealed templates that instantiate identities. | T/B templates apply onto the current creator identity and keep prompts hidden in UI/export payloads. |
| ✅ | 6 | Add creator-level API/model/context budget overrides. | Global defaults remain; creator-level provider/model/max output/context token budget can override them. |
| ✅ | 7 | Rebuild writer state as a session tool with style cache. | Writer is session-local and inherits primary creator model/style; AI style compression has local fallback. |
| ✅ | 8 | Add private chat creation/opening for council identities. | Council identities open their own creator sessions instead of old inline fake private chat. |
| ✅ | 9 | Add `创作者们` settings page. | Fourth settings page lists creators, memory previews, attached sessions, roundtables, and deletion controls. |
| ✅ | 10 | Add session export/import without API keys. | Structured package import/export is implemented; sealed prompts export by template code only. |
| ✅ | 11 | Add participation record management and memory lookup rules. | New creator records are written; chat and roundtable prompts can recall creator memory/records when continuity is needed. |
| ✅ | 12 | Add source-session clone loading state. | Pulling another session primary creator shows pending/in-seat compression state and creates a variant identity. |
| ✅ | 13 | Use creator context budget for automatic compression. | Main chat uses current primary creator budget; roundtable uses the speaking assistant budget. |
| ✅ | 14 | Add creator package import/export. | Creator packages exclude API keys; sealed templates export by code and restore prompts from local templates. |
| ✅ | 15 | Add imported creator replacement for current primary creator. | Import can replace the current session primary creator and writes a compressed handoff memory. |
| ✅ | 16 | Add layered creator memory/record deletion. | Creator cards can delete individual compressed memories and individual participation records. |
| ✅ | 17 | Add live source-session memory for pulled primary clones. | Clones can include the current source session materials/recent active path when that source session still exists locally. |
| ⬜ | 18 | Run full Android regression. | Needs phone QA for chat/roundtable scrolling, hidden templates, import/export, APK update migration. |
| ✅ | 19 | Polish creator management into a full detail page. | Creator cards now open a detail page with memory, records, sessions, roundtables, and actions. |
| ✅ | 20 | Add explicit memory query UX/controls. | Creator detail can manually query memory and inspect recalled snippets. |
| ✅ | 21 | Connect workspace files to AI context. | Text-like workspace files store excerpts; main chat and roundtable prompts include workspace path, categories, and excerpts. |
| ✅ | 22 | Persist default chat-mode return on session switch. | Switching sessions clears roundtable UI state and saves that state immediately. |

## Refactor Checkpoints

| Done | Area | Note |
| --- | --- | --- |
| ✅ | Workspace controller | Workspace files, excerpts, categories, and memory UI moved out of `main.js`. |
| ✅ | Import/export controller | Global backup, session package, and creator package flows moved out of `main.js`. |
| ✅ | Creator controller | Creator detail, memory rename/query/delete, roundtable removal, and private-session opening moved out of `main.js`. |
| ✅ | Writer controller | Writer style inheritance, style compression, prose generation, and novel sync moved out of `main.js`. |
| ✅ | Roundtable controller | Participant import, cloned primary creators, context building, model calls, round progress, and mention follow-ups moved out of `main.js`. |
| ✅ | Assistant controller | Persona import/export, imported council seats, private chat prompt building, and activation prompt building moved out of `main.js`. |
| 🟡 | Assistant settings save UI | Save payload building moved into `assistant-controller`; `saveAssistantConfigFromForm` still owns dialog lifecycle, render, toast, and persistence side effects. |
| ⬜ | Full phone QA | Chat/roundtable scrolling, hidden template UI, import/export, and migration still need real-device regression. |

## Out of Scope for First Pass

1. Editing raw internal memory text.
2. Manually including abandoned branches in memory.
3. True encrypted export.
4. Multi-device live identity sync.
5. Full desktop file-system workspace automation.
