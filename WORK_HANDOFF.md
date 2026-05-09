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

## Current Goal

The current UI direction is a mobile-first Android chat scene for Roundtable Novelbox:

- A manuscript paper floats above the group discussion area instead of being a hard split panel.
- The paper should feel like a draggable, collapsible sheet laid on top of a QQ/WeChat-style group chat.
- The manuscript paper is now meant for human reading of historical prose.
- The AI roundtable context must still use a trimmed excerpt instead of the full manuscript body.

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

- remember paper scroll position per session
- optionally jump to latest appended writer segment
- add a small “new prose” anchor when not at bottom

## Quick Resume Prompt For Next Agent

Use this if another session needs to continue:

“Continue work on the Roundtable Novelbox floating manuscript paper UI in `D:\CodexW\TBird_Novelbox`. The paper now overlaps the chat, is draggable/collapsible, and shows full manuscript history in the visible viewport, while AI still receives a trimmed excerpt through `getRoundtablePromptExcerpt()`. Please continue mobile Android/WebView tuning and improve the paper grip / collapse interaction without breaking the visible-paper vs prompt-excerpt split.”
