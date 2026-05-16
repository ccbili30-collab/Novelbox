# TBird Roundtable Box — v0.2.0 MD3 redesign · debug builds

## 1. WebView build
`tbird-roundtable-md3-debug.apk` (app id `com.qinglan.chatnovel`) — legacy
web app inside a WebView. Source: `android-app/`.

## 2. Native build (Kotlin + Jetpack Compose + Material 3)
`tbird-roundtable-native-debug.apk` — 16 MB
SHA-256: `a33bf59ef1b165fd5fc7e9fb69b9f95d2c9c4ccfb85d4c76ceb05cf219380bf0`
App id: `com.qinglan.chatnovel.native.debug`. Installable alongside #1.

### Features in this APK

- Material You dynamic color (Android 12+), light/dark/system fallback.
- Persistent session history (JSON-on-disk, atomic tmp+rename, mutex).
- Multiple sessions via M3 ModalNavigationDrawer.
- Auto title from the first user message.
- System prompt via M3 ModalBottomSheet — prepended to every API call.
- Streaming OpenAI Chat Completions with mid-stream abort.
- Persona library editor (PersonasScreen): list / add / edit / delete.
- Roundtable mode with sequential persona replies, mention-driven
  reorder, per-persona bubble tinting + speaker labels.
- **@-mention picker (Phase 6)** — in roundtable mode, typing
  `@` (or `@xxx` partial) inside the composer pops a M3 list of
  matching personas. Tapping a row replaces `@partial` with
  `@<full-name> ` and positions the caret after the trailing space.
- System file picker for session import / export (Phase 7).
- Per-message actions: copy / regenerate / delete (Phase 8).
- Manuscript paper surface — long-form scrolling viewer + edit mode
  with auto-sync from writer-persona output (Phases 9, 10).
- Per-persona long-term memory + recall-on-turn scoring (Phase 11).
- Markdown manuscript export + word count (Phase 12).
- Roundtable pause / resume + "再开一轮" control (Phase 13).
- Auto-memory writer — after each roundtable round the model
  extracts new facts from the chat history and appends them to the
  persona's memory pool (Phase 14).
- **Session search + bulk export + manuscript share (Phase 15)** ☆ new
  — drawer search field filters by title / manuscript / message
  content; settings has "导出全部会话" via SAF; manuscript top-bar
  exposes a system share-sheet button.
- CI workflow runs `./gradlew testDebugUnitTest` + `assembleDebug` on
  every push, uploads the test report and APK as artifacts.

### Verified by 110 tests, 0 failures

```
AppPrefsTest                         2
ChatMessageTest                      2
PersonaStoreTest                     6
RoundtableTest                      11
SessionStoreTest                    16   ← +5 search cases (Phase 15)
SessionTransferTest                  7
MentionResolverTest                 11
MemoryRetrievalTest                  7
MemoryExtractorTest                 10
ManuscriptExporterTest               9
ChatScreenUiTest                     5
ChatViewModelRoundtableTest          4
ChatViewModelManuscriptTest          5
ChatViewModelMessageActionsTest      6
ChatViewModelResumeTest              6
PersonasScreenUiTest                 3
─────────────────────────────────────
TOTAL                              110
```

### Build it yourself

```bash
cd android-native
ANDROID_HOME=/opt/android-sdk ./gradlew testDebugUnitTest assembleDebug --no-daemon
```

Or push to a branch and let CI handle it (`.github/workflows/ci.yml`
now ships a `android-native` job that runs tests + builds + uploads
the APK as an artifact).

### Phase 16+ backlog

Branching session tree, PDF manuscript export, per-persona avatar
images, in-app pull-to-refresh on the session drawer.
