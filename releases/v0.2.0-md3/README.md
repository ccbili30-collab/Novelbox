# TBird Roundtable Box — v0.2.0 MD3 redesign · debug builds

## 1. WebView build
`tbird-roundtable-md3-debug.apk` (app id `com.qinglan.chatnovel`) — full
legacy web app wrapped in a WebView. Source: `android-app/`.

## 2. Native build (Kotlin + Jetpack Compose + Material 3)
`tbird-roundtable-native-debug.apk` — 16 MB
SHA-256: `d785a143c591248eb32f2f8c2ba42e2bafbea2a5afc6b149d1679b215e6ea163`
App id: `com.qinglan.chatnovel.native.debug`. Installable alongside #1.

### Features in this APK

- Material You dynamic color on Android 12+, light/dark/system fallback.
- Persistent session history (JSON-on-disk, atomic tmp+rename, mutex).
- Multiple sessions via M3 ModalNavigationDrawer.
- Auto title from the first user message.
- System prompt via M3 ModalBottomSheet — prepended to every API call.
- Streaming OpenAI Chat Completions with mid-stream abort.
- Persona library editor (PersonasScreen): list / add / edit / delete
  AI participants. Auto-seeded with 4 starter creators on first launch.
- **Roundtable mode (Phase 5)** ☆ new:
    - Top-bar 'groups' icon opens a M3 ModalBottomSheet with the enable
      switch + a FilterChip per persona. Tap to add/remove from the
      round; the chip shows "1. 设定师 · 设定" so order is visible.
    - Top app bar tints to secondaryContainer while roundtable mode is
      on; the composer shows a small "圆桌模式 · 发送后所有参会议员依次发言" hint.
    - On send, the orchestrator loops through the ordered personas.
      For each persona it composes a per-turn system prompt
      (composeSystemPrompt = session prompt + persona prompt + role
      label + turn hint), tags every prior assistant message in the
      history with its speaker name, streams the reply into a
      placeholder bubble tagged with the speaker.
    - After each reply, `parseMentions` scans for @persona references
      and `reorderForMentions` moves them ahead in the remaining queue.
    - Stop button cancels mid-turn and freezes the partial text.
    - Per-persona bubble tinting: each speakerId is hashed into one of
      four M3 container tones (tertiary / secondary / surfaceVariant /
      surfaceContainerHighest) so it's visually obvious who said what.
    - Speaker name renders as a small label above the bubble.

### Verified by 49 tests (38 JVM unit + 11 Robolectric Compose UI / VM), 0 failures

```
AppPrefsTest                         2
ChatMessageTest                      2
PersonaStoreTest                     6
RoundtableTest                       9
SessionStoreTest                    11
SessionTransferTest                  7
ChatScreenUiTest                     5   ← Robolectric + Compose UI
ChatViewModelRoundtableTest          4   ← Robolectric + VM state
PersonasScreenUiTest                 3   ← Robolectric + Compose UI
─────────────────────────────────────
TOTAL                               49
```

New in Phase 5:
- `ChatViewModelRoundtableTest`:
    1. roundtable starts disabled with an empty member list
    2. toggleRoundtable flips the persisted flag (round-trips disk)
    3. toggleRoundtableMember adds then removes by id (round-trips disk)
    4. member order matches the order taps were applied

The VM tests use `Dispatchers.setMain(Unconfined)` so viewModelScope
launches resolve synchronously inside the test thread — no flaky
"waiting for the test coroutine to complete" timeouts.

### Build it yourself

```bash
cd android-native
ANDROID_HOME=/opt/android-sdk ./gradlew testDebugUnitTest assembleDebug --no-daemon
```

### Phase 6+ backlog

@-mention picker dropdown in the composer, manuscript paper sync,
creator memory (per-persona long-term knowledge), branching session
tree, system file-picker glue for import/export, CI workflow that
runs `./gradlew testDebugUnitTest` on every push.
