# TBird Novelbox Handoff

Updated: 2026-05-09
Workspace: `D:\CodexW\TBird_Novelbox`
Preview URL: `http://127.0.0.1:5177/`

## UI Approval

The current floating-paper-over-chat UI direction has been accepted by the user as good enough to keep.

Keep this core composition:

- clean, low-distraction writing surface
- manuscript paper visually floating above the group chat
- QQ/WeChat-like discussion underneath
- draggable/collapsible paper, not a hard split panel
- roundtable member settings should open as a bottom sheet above the composer, not as a top document-flow block

## Current Goal

The current UI direction is a mobile-first Android chat scene for Roundtable Novelbox:

- A manuscript paper floats above the group discussion area instead of being a hard split panel.
- The paper should feel like a draggable, collapsible sheet laid on top of a QQ/WeChat-style group chat.
- The paper should sit tight under the roundtable top bar; do not place a visible "writer area" heading above it.
- The manuscript paper is now meant for human reading of historical prose.
- The AI roundtable context must still use a trimmed excerpt instead of the full manuscript body.

## Current Roundtable Behavior

Activated council members now have real social interpretation:

- an activated member may treat member joining, leaving, deletion, silence, pause, hide, or API failure as meeting dynamics
- it may briefly infer atmosphere, responsibility, or conflict impact, such as "someone was asked out" or "my words may have made them leave"
- this is intentionally limited to short creative-discussion color, not long emotional acting
- if the user says "别演" or "回到工具模式", activated members must stop social interpretation

Inactive members are still dry professional modules:

- they treat deletion, sorting, API failure, and hiding as tool/config events
- they should not infer social relationships, emotional drama, or who made whom leave

Roundtable mention rules:

- only ordered/selected council members can be mentioned with @
- `@写手` remains available even though writer is not part of the numbered council order
- unselected council members are treated as unavailable for @ and should not be triggered by user or assistant messages

Streaming output:

- stream output is the default for sessions that have not explicitly changed the stream switch
- once the user toggles the stream switch, that choice is preserved per session

## What Was Implemented In This Session

### 1. Roundtable visual structure was redesigned

The previous roundtable beta block was reshaped into:

- top floating manuscript paper
- lower chat-style discussion timeline
- time dividers
- avatars
- role badges
- distinct writer update card

Files:

- `index.html`
- `src/main.js`
- `src/styles/components.css`
- `src/styles/layout.css`

### 2. Manuscript paper became a floating interactive sheet

Implemented:

- paper overlap visual over the chat region
- internal paper scroll viewport
- draggable grip at the bottom of the paper
- tap-to-toggle expand/collapse behavior
- reveal percentage label
- adaptive height based on Android/WebView viewport

Important implementation details:

- reveal state is stored in `session.roundtable.paperReveal`
- grip uses pointer events, not mouse-only logic
- viewport height uses `window.visualViewport` when available
- min/max paper heights are derived from screen height, then clamped

### 3. Manuscript paper now shows full manuscript history

The paper now shows the full text from `sessionNovel().body` when available.

That means:

- users can scroll inside the paper to review older prose
- the paper is no longer just a short excerpt
- if the writer appends new prose and the paper was already near the bottom, the paper follows to the latest text

### 4. AI roundtable still uses trimmed context

This was intentionally preserved.

The visible paper and the prompt excerpt were split:

- visible paper text: full normalized manuscript history
- AI prompt paper text: trimmed tail excerpt only

This prevents giant novel bodies from being dumped into every roundtable turn.

## Files Changed

- `D:\CodexW\TBird_Novelbox\index.html`
- `D:\CodexW\TBird_Novelbox\src\main.js`
- `D:\CodexW\TBird_Novelbox\src\styles\components.css`
- `D:\CodexW\TBird_Novelbox\src\styles\layout.css`

## Key Code Locations

### Markup

- `index.html`
  - `#roundtableWorkspace`
  - `#roundtablePaper`
  - `#roundtablePaperViewport`
  - `#roundtablePaperGrip`

### Roundtable rendering and manuscript logic

- `src/main.js`
  - `renderRoundtable()`
  - `renderRoundtableDiscussion()`
  - `renderRoundtableMessage()`
  - `getRoundtablePaperSource()`
  - `getRoundtableManuscript()`
  - `getRoundtablePromptExcerpt()`

### Drag / collapse / responsive paper behavior

- `src/main.js`
  - `getRoundtablePaperMetrics()`
  - `syncRoundtablePaper()`
  - `setRoundtablePaperReveal()`
  - `toggleRoundtablePaperReveal()`
  - `handleRoundtablePaperPointerDown()`
  - `handleRoundtablePaperPointerMove()`
  - `finishRoundtablePaperDrag()`

### Styles

- `src/styles/components.css`
  - `.manuscript-desk`
  - `.manuscript-paper`
  - `.paper-scroll-viewport`
  - `.paper-grip`
  - `.roundtable-discussion`
  - `.roundtable-line`
  - `.roundtable-writer-card`

- `src/styles/layout.css`
  - `.roundtable-workspace`
  - `.roundtable-mode .topbar`
  - `.roundtable-mode .composer`

## Important Behavior Contracts

### Visible manuscript vs AI prompt manuscript

Do not merge these back together accidentally.

- `getRoundtableManuscript()` is for the visible paper.
- `getRoundtablePromptExcerpt()` is for the AI prompt.

This split is intentional and necessary.

### Writer output sync

When roundtable writer generates text:

- it is added as a roundtable writer message
- it is appended to `sessionNovel().body`
- the paper updates from that manuscript body

### Screen fitting

The UI is intended for Android WebView behavior, not desktop-first layout.

Current sizing logic:

- min paper height: about `16%` of viewport, clamped
- max paper height: about `46%` of viewport, clamped
- viewport source: `window.visualViewport?.height || window.innerHeight`

## Current Local Status

These changes should be treated as the accepted baseline for the next round of work.

Commit/push status should be checked with:

```powershell
git status --short
git log --oneline -3
```

## Validation Done

Checked:

- `node --check src/main.js`
- preview server responds at `http://127.0.0.1:5177/`

Not yet fully done:

- full manual device QA across multiple Android screen sizes
- optional hand-feel tuning for drag resistance and collapse thresholds
- optional visual polish for the grip so it feels even more like a paper tab/bookmark

## Recommended Next Steps

### Main Update: Roundtable Round Resume

Implemented on `main`:

- `开始本轮` now records round progress before running selected assistants
- `继续本轮` resumes from the next uncompleted assistant after a manual stop or interruption
- progress is stored in `session.roundtable.roundProgress`
- completed rounds clear progress automatically
- the round topic is captured at round start so resumed rounds keep the same topic

Important code locations:

- `index.html`
  - `data-command="roundtable-resume"`
- `src/main.js`
  - `startRoundtableRound()`
  - `resumeRoundtableRound()`
  - `runRoundtableProgress()`

### Main Update: Assistant Import / Export

Implemented on `main`:

- assistant settings can export the current form as a JSON assistant file
- assistant settings can import a JSON assistant file into the current form
- imported assistant configs require `name` and `prompt`, then become active only after saving
- assistant export uses `Roundtable-助手-<name>.json`

Important code locations:

- `index.html`
  - `#assistantImportFile`
  - `#importAssistantButton`
  - `#exportAssistantButton`
- `src/main.js`
  - `exportAssistantConfig()`
  - `importAssistantConfig()`
  - `handleAssistantImportSelected()`
  - `currentAssistantFormConfig()`

### Feature Line Update: Round Topic

Functional branch: `codex/roundtable-features`

Implemented in the feature line:

- the composer-side roundtable material panel now includes `本轮主题`
- the topic is stored per session in `session.roundtable.contextOptions.roundTopic`
- `开始本轮` uses the topic as the round instruction when present
- `buildRoundtableMessages()` includes the topic as a separate prompt block, so all assistants stay focused on the same question

Important code locations:

- `src/main.js`
  - `normalizeRoundtableContextOptions()`
  - `renderRoundtableContextControls()`
  - `updateRoundtableContextOption()`
  - `startRoundtableRound()`
  - `buildRoundtableMessages()`
- `src/styles/components.css`
  - `.roundtable-context-topic`

### Feature Line Update: Mainline / Roundtable Handoff

Functional branch: `codex/roundtable-features`

Implemented in the feature line:

- ordinary main chat messages now have `发到圆桌` in the message menu
- sending a mainline message to roundtable enables roundtable mode and adds it as a roundtable discussion item with source metadata
- roundtable messages now have `发回主线` in their menu
- sending a roundtable message back to mainline exits roundtable mode and posts the message as a new user turn, then calls the normal mainline AI flow

Important code locations:

- `src/main.js`
  - `sendMainMessageToRoundtable()`
  - `sendRoundtableMessageToMain()`
  - `renderMenu()`
  - `renderRoundtableMenu()`

### Feature Line Update: Roundtable Approval Flow

Functional branch: `codex/roundtable-features`

Implemented in the feature line:

- non-writer assistant messages can be marked as `采纳` or `忽略`
- review messages can also be marked as `通过` or `需修改`
- decision badges render directly on roundtable messages
- the roundtable header has `采纳续写`, which asks the writer to continue using only messages marked `采纳`
- existing single-message `让写手采纳` remains available for quick one-off adoption

Important code locations:

- `index.html`
  - `data-command="roundtable-write-adopted"`
- `src/main.js`
  - `renderRoundtableDecisionBadge()`
  - `markRoundtableDecision()`
  - `writeFromAdoptedRoundtableMessages()`
  - `renderRoundtableMenu()`
- `src/styles/components.css`
  - `.roundtable-decision`

### Feature Line Update: Manuscript Version History

Functional branch: `codex/roundtable-features`

Implemented in the feature line:

- the novel panel now has a `保存版本` action for manually saving the current manuscript body
- the novel panel shows the latest manuscript versions with restore/delete actions
- up to 40 manuscript versions are stored per session under `session.novel.versions`
- importing TXT and syncing all AI output into the body now records manuscript versions
- writer continuation, writer replacement, and writer rollback now record manuscript versions automatically
- restoring a version first saves a `恢复前备份` version of the current body, then replaces `sessionNovel().body`

Important code locations:

- `index.html`
  - `#novelVersionList`
  - `data-command="save-manuscript-version"`
- `src/main.js`
  - `recordManuscriptVersion()`
  - `saveManuscriptVersion()`
  - `restoreManuscriptVersion()`
  - `deleteManuscriptVersion()`
  - `renderNovelVersions()`
- `src/styles/panels.css`
  - `.novel-version-list`
  - `.novel-version-item`

### Feature Line Update: Assistant Templates

Functional branch: `codex/roundtable-features`

Implemented in the feature line:

- assistant settings now include an assistant template selector
- selecting a template fills the assistant display name and role prompt before saving
- available templates: 反对者, 伏笔管理员, 节奏剪辑师, 角色心理师, 连续性检查员
- templates work for custom assistants and can also be applied to built-in assistants when the user wants to repurpose one for the current session

Important code locations:

- `index.html`
  - `#assistantTemplateSelect`
- `src/main.js`
  - `ASSISTANT_TEMPLATES`
  - `renderAssistantTemplates()`
  - `applyAssistantTemplate()`
- `src/styles/panels.css`
  - assistant config select styling

### Feature Line Update: Roundtable Context Controls

Functional branch: `codex/roundtable-features`

Implemented in the feature line:

- the composer send area now includes per-session context controls for each round
- users can choose whether assistants see the manuscript excerpt, novel materials, main chat, and roundtable discussion history
- users can tune manuscript excerpt length from 120 to 2400 characters
- users can tune roundtable discussion history count from 0 to 80 messages
- default settings preserve previous behavior for existing sessions
- `buildRoundtableMessages()` now omits disabled context blocks completely instead of sending empty placeholders
- this gives users a practical way to reduce oversized prompt failures while keeping the visible manuscript paper unchanged

Important code locations:

- `index.html`
  - `#roundtableContextButton`
  - `#roundtableContextDock`
- `src/main.js`
  - `DEFAULT_ROUNDTABLE_CONTEXT`
  - `normalizeRoundtableContextOptions()`
  - `renderRoundtableContextControls()`
  - `toggleRoundtableContextDock()`
  - `updateRoundtableContextOption()`
  - `buildRoundtableMessages()`
- `src/styles/components.css`
  - `.roundtable-context-button`
  - `.roundtable-context-dock`
  - `.roundtable-context-options`

### Feature Line Update: Writer Manuscript Sync Control

Functional branch: `codex/roundtable-features`

Implemented in the feature line:

- new writer outputs now store manuscript sync metadata on the writer roundtable message
- writer message menu includes `撤回正文`
- `撤回正文` removes only the prose segment that this writer message synced into `sessionNovel().body`
- old writer messages without sync metadata can still be reverted if their text is still the exact tail of the manuscript body
- writer message menu includes `重写并替换`
- `重写并替换` asks the writer to rewrite that prose card and replaces the corresponding manuscript segment instead of appending another copy
- if the manuscript was edited and the original segment can no longer be matched, the app refuses automatic rollback/replacement instead of corrupting the body

Important code locations:

- `src/main.js`
  - `syncWriterMessageToNovel()`
  - `replaceSyncedWriterSegment()`
  - `removeSyncedWriterSegment()`
  - `undoWriterManuscriptSync()`
  - `rewriteWriterManuscriptSync()`
  - `generateRoundtableWriter()`
  - `renderRoundtableMenu()`

### Feature Line Update: Custom Roundtable Assistants

Functional branch: `codex/roundtable-features`

Implemented in the feature line:

- roundtable member panel now supports adding custom assistants per session
- a new custom assistant is selected into the speaking order immediately and opens the assistant settings dialog
- custom assistants can use their own display name, prompt, model, and temperature
- custom assistant names work as `@` mention aliases, just like built-in assistants
- custom assistants are included in roundtable context so other assistants can see who is present
- custom assistants can be deleted from the settings dialog without deleting old discussion history
- the old bottom-sheet Beta preview copy was rewritten as a formal roundtable entry

Important code locations:

- `src/main.js`
  - `roundtableState()`
  - `normalizeCustomAssistant()`
  - `getRoundAssistantBases()`
  - `createCustomRoundAssistant()`
  - `deleteCustomRoundAssistant()`
  - `renderRoundtableMembers()`
  - `parseRoundtableMentions()`
- `index.html`
  - `#deleteAssistantButton`
  - `#roundtablePanel`
- `src/styles/components.css`
  - `.roundtable-member-add`

### Feature Line Update: Roundtable Stop Control

Functional branch: `codex/roundtable-features`

Implemented in the feature line:

- roundtable mode now has a visible `停止` action next to `开始本轮`
- pressing `停止` aborts the current assistant request and prevents the remaining selected assistants from continuing the queued round
- pressing the composer send button while roundtable generation is active also stops the current roundtable task
- aborted roundtable requests suppress failure toasts, so manual stops do not look like upstream errors
- roundtable stop state is reset after each queued mention, full round, or writer generation finishes

Important code locations:

- `index.html`
  - roundtable action button: `data-command="roundtable-stop"`
- `src/main.js`
  - `roundtableShouldStop`
  - `stopRoundtableGeneration()`
  - `generateMentionedRoundtableAssistants()`
  - `startRoundtableRound()`
  - `generateRoundtableWriter()`
  - composer `submit` handler

Validation:

- `node --check src/main.js`
- `node --check dev-server.mjs`
- `git diff --check`
- `android-app\gradlew.bat assembleDebug --offline --no-daemon`

### Feature Line Update: Assistant Configuration

Functional branch: `codex/roundtable-features`

Implemented in the feature line:

- per-session assistant configuration for roundtable members
- editable assistant display name, prompt, model, and temperature
- writer can be configured from the member panel, but is not part of the ordinary discussion order
- roundtable calls use the assistant-specific model and temperature when provided
- empty assistant model falls back to the current session model
- assistant configuration is stored under `session.roundtable.assistantConfigs`
- users can mention a specific assistant in the roundtable input
- supported mentions include `@设定师`, `@剧情师`, `@审稿`, `@文风师`, and `@写手`
- custom assistant display names are also accepted as mention aliases
- `@写手` still generates manuscript prose and appends it to the manuscript body
- ordinary assistant mentions generate only the named assistant reply, not a full round
- roundtable messages now open a bottom action menu when tapped
- roundtable menu supports copy, delete, regenerate assistant reply, and ask writer to adopt the message
- writer-message regenerate creates a new writer continuation rather than editing old manuscript history in place

Important code locations:

- `index.html`
  - `#assistantConfigDialog`
  - `#assistantNameInput`
  - `#assistantModelInput`
  - `#assistantTemperatureInput`
  - `#assistantPromptInput`
- `src/main.js`
  - `getRoundAssistant()`
  - `parseRoundtableMentions()`
  - `generateMentionedRoundtableAssistants()`
  - `renderRoundtableMenu()`
  - `deleteRoundtableMessage()`
  - `adoptRoundtableMessage()`
  - `regenerateRoundtableMessage()`
  - `openAssistantConfig()`
  - `saveAssistantConfig()`
  - `resetAssistantConfig()`
  - `callRoundtableAssistant()`
- `src/services/api/request-builder.js`
  - minimal text calls now preserve temperature and max token settings

Validation:

- `node --check src/main.js`
- `node --check dev-server.mjs`
- `git diff --check`
- `android-app\gradlew.bat assembleDebug --offline --no-daemon`

Note for additional worktrees:

- Android builds need ignored `android-app/local.properties` in each worktree, or `ANDROID_HOME` / `ANDROID_SDK_ROOT`.

### Main Update: Android Bridge Cancel On Stop

Implemented on `main`:

- stopping normal generation now cancels the active Android bridge request id
- stopping roundtable generation now cancels both normal bridge and stream bridge request ids
- Android keeps a cancelled request-id set and suppresses late callbacks for cancelled requests
- cancelled non-stream results no longer call back into WebView or post the finished notification
- cancelled stream results no longer deliver late chunks, done callbacks, error callbacks, or failure notifications
- JS clears stale bridge request ids immediately after manual stop

Important code locations:

- `src/services/bridge/bridge-client.js`
  - `setActiveRequestId`
  - `cancelBridgeRequest()`
- `src/main.js`
  - `bridgeRequestId`
  - `stopGeneration()`
  - `stopRoundtableGeneration()`
  - `callOpenAIText()`
  - `callOpenAITextWithSettings()`
- `android-app/app/src/main/java/com/qinglan/chatnovel/MainActivity.java`
  - `cancelledRequestIds`
  - `AndroidBridge.cancelRequest()`
  - `isRequestCancelled()`
  - `clearCancelledRequest()`
  - `openAIChatAsync()`
  - `streamOpenAIChat()`

Validation:

- `node --check src/main.js`
- `node --check dev-server.mjs`
- `git diff --check`
- `android-app\gradlew.bat assembleDebug --offline --no-daemon`

### Main Update: Roundtable Paper Reading State

Implemented on `main`:

- the floating manuscript paper now remembers its scroll position per session
- when the user is reading the middle of the manuscript, new writer prose does not force-scroll the paper
- when new writer prose arrives while the paper is not at the bottom, a `跳到最新正文` anchor appears
- tapping the anchor jumps the paper to the newest prose and clears the unread marker
- if the paper was already near the bottom, new writer prose still follows automatically

Important code locations:

- `index.html`
  - `#roundtablePaperJump`
- `src/main.js`
  - `syncRoundtablePaperContent()`
  - `handleRoundtablePaperScroll()`
  - `jumpRoundtablePaperLatest()`
  - `scrollRoundtablePaperBottom()`
  - `roundtableState()` paper state fields
- `src/styles/components.css`
  - `.paper-new-anchor`

Validation:

- `node --check src/main.js`
- `node --check dev-server.mjs`
- `git diff --check`
- `android-app\gradlew.bat assembleDebug --offline --no-daemon`

### Main Update: Writer Segment Management

Implemented on `main`:

- writer outputs synced into the manuscript now appear as manageable segments in the novel panel
- each writer segment can be located in the floating paper, rewritten, withdrawn from the manuscript, or kept only in manuscript while hiding the roundtable bubble
- writer roundtable message menus also expose `定位正文` and `仅保留正文`
- stale segment cards show when the manuscript text has been edited and no longer exactly matches the stored sync segment

Important code locations:

- `index.html`
  - `#novelSegmentList`
- `src/main.js`
  - `getWriterManuscriptSegments()`
  - `renderNovelSegments()`
  - `locateWriterSegment()`
  - `hideWriterMessageKeepText()`
  - existing `rewriteWriterManuscriptSync()` / `undoWriterManuscriptSync()`
- `src/styles/panels.css`
  - `.novel-segment-list`
  - `.novel-segment-item`

### Main Update: Automatic Context Compression

Implemented on `main`:

- mainline generation estimates full context size before calling the model
- when context exceeds the threshold, TBird asks the model to compress current materials into plotline, characters, world, outline, and foreshadows
- after compression, generation continues using the novel material memory and a shorter recent-chat tail
- roundtable calls also compress oversized roundtable prompts by keeping short manuscript excerpts, recent roundtable records, and novel memory
- repeated compression is skipped when the source size has not changed enough

Important code locations:

- `src/main.js`
  - `AUTO_CONTEXT_TOKEN_THRESHOLD`
  - `contextMessages()`
  - `estimateFullContextTokens()`
  - `ensureAutoCompressNovelMemory()`
  - `buildRoundtableMessages()`
- `src/domain/novel/novel-model.js`
  - `autoCompression`

Validation:

- `node --check src/main.js`
- `node --check dev-server.mjs`
- `git diff --check`

### Main Update: Per-Assistant Runtime Settings

Implemented on `main`:

- each roundtable assistant, including the writer, can override Base URL, API Key, model, temperature, and max tokens
- blank assistant API/model fields fall back to the global settings
- the top roundtable toolbar now has a direct writer settings entry
- each assistant can independently choose whether it sees manuscript excerpt, novel materials, main chat, and roundtable discussion
- selected roundtable members can be moved up/down; `session.roundtable.selectedIds` is the formal speaking order, and `roundProgress.ids` freezes the queue for a running round
- roundtable rounds isolate failures: if one assistant API fails, TBird records a failed assistant message and continues to the next selected assistant

Important code locations:

- `index.html`
  - assistant config fields for API/model/max tokens/context visibility
  - `data-command="roundtable-writer-settings"`
- `src/main.js`
  - `getRoundAssistant()`
  - `getRoundAssistantConfig()`
  - `currentAssistantFormConfig()`
  - `saveAssistantConfig()`
  - `moveRoundtableMember()`
  - `addRoundtableFailureMessage()`
  - `callRoundtableAssistant()`
  - `buildRoundtableMessages()`
- `src/styles/panels.css`
  - `.assistant-context-options`
- `src/styles/components.css`
  - `.roundtable-line.failed`

Validation:

- `node --check src/main.js`
- `node --check scripts/build-android-assets.mjs`
- `node --check dev-server.mjs`
- `git diff --check`
- `android-app\gradlew.bat assembleDebug --offline --no-daemon`

### Main Update: Generative-Agent Inspired Council Memory

Implemented on `main`:

- default council roles are now writer, worldbuilder, character manager, foreshadow manager, and event manager
- internal ids were kept stable for migration safety: `setting`, `review`, `style`, `plot`, `writer`
- council members stay dry professional modules until activated
- activated non-writer members receive an actor identity card plus a short memory stream inspired by `joonspk-research/generative_agents`
- after an activated member speaks, TBird asks the model for one short private memory and stores it under `assistantConfigs[id].memories`
- future activated turns include the latest memories so the member can keep a stable stance
- inactive members are explicitly told not to infer social meaning from member add/delete/sort/failure events
- activated members may understand social tone and disagreement, but still cannot treat user configuration events as someone being "driven away" unless the user asks for dramatization

Important code locations:

- `src/main.js`
  - `GENERATIVE_AGENT_MEMORY_LIMIT`
  - `ROUND_ASSISTANTS`
  - `normalizeAssistantMemories()`
  - `isSociallyActivatedAssistant()`
  - `buildAssistantActivationMessages()`
  - `rememberActivatedAssistantTurn()`
  - `buildAssistantMemoryPrompt()`
  - `buildRoundtableMessages()`
- `index.html`
  - activated council labels and default member examples

Validation:

- `node --check src/main.js`
- `node --check scripts/build-android-assets.mjs`
- `node --check dev-server.mjs`
- `git diff --check`

### Priority 1: Real device tuning

Test in Android/WebView-like sizes and tune:

- collapsed visible height
- expanded height ceiling
- drag sensitivity
- whether the grip overlaps the paper too much on narrow phones

### Priority 2: Better paper reading feel

Possible improvements:

- show only first paragraph(s) when deeply collapsed
- show a subtle paper scroll progress indicator
- add stronger shadow/depth change while dragging
- add light inertia or snapping between 3 states: collapsed / reading / expanded

### Priority 3: Writer-specific manuscript navigation

Potential future improvement:

- optionally highlight the exact appended writer segment after jumping to latest prose
- optionally add previous/next writer-segment navigation inside the paper

## Quick Resume Prompt For Next Agent

Use this if another session needs to continue:

“Continue work on the Roundtable Novelbox floating manuscript paper UI in `D:\CodexW\TBird_Novelbox`. The paper now overlaps the chat, is draggable/collapsible, and shows full manuscript history in the visible viewport, while AI still receives a trimmed excerpt through `getRoundtablePromptExcerpt()`. Please continue mobile Android/WebView tuning and improve the paper grip / collapse interaction without breaking the visible-paper vs prompt-excerpt split.”
