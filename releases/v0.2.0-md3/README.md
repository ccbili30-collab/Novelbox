# TBird Roundtable Box — v0.2.0 MD3 redesign · debug builds

## 1. WebView build
`tbird-roundtable-md3-debug.apk` (app id `com.qinglan.chatnovel`) — full
legacy web app wrapped in a WebView. Source: `android-app/`.

## 2. Native build (Kotlin + Jetpack Compose + Material 3)
`tbird-roundtable-native-debug.apk` — 16 MB
SHA-256: `dbaf0f4e713751939622e2e30397193e9882adccb2cac10c61da33b1ca9c07ed`
App id: `com.qinglan.chatnovel.native.debug`. Installable alongside #1.

### Features in this APK

- Material You dynamic color on Android 12+, light/dark/system fallback.
- Persistent session history (JSON-on-disk, atomic tmp+rename, mutex).
- Multiple sessions via M3 ModalNavigationDrawer.
- Auto title from the first user message.
- System prompt via M3 ModalBottomSheet — prepended to every API call.
- Streaming OpenAI Chat Completions with mid-stream abort.
- **Persona library editor** (PersonasScreen): list / add / edit / delete
  the AI participants that will join the roundtable. Auto-seeded with
  4 starter creators (设定师 / 剧情师 / 文风师 / 怀疑型主创) on first launch.
- Roundtable kernel (parseMentions / reorderForMentions /
  composeSystemPrompt) — pure + tested.
- Single-session import/export helpers.
- Settings page navigates to the persona editor via M3 list card.
- Edge-to-edge layout, IME-aware composer, splash + adaptive icon.

### Verified by 45 tests (37 JVM unit + 8 Robolectric Compose UI), 0 failures

```
AppPrefsTest                  2
ChatMessageTest               2
PersonaStoreTest              6
RoundtableTest                9
SessionStoreTest             11
SessionTransferTest           7
ChatScreenUiTest              5   ← Robolectric + Compose UI
PersonasScreenUiTest          3   ← Robolectric + Compose UI
─────────────────────────────────
TOTAL                        45
```

**Emulator constraints in this build sandbox**: no `/dev/kvm`, no
vmx/svm CPU flags — the standard Android emulator can't run.
Robolectric is the working alternative: it mounts the Android
framework + Compose semantic tree on the JVM and exercises the
same Composable functions that ship in the APK.

What the UI tests cover:
- Chat screen: empty-state copy + chips, send disabled when composer
  is empty, typing enables send, suggestion chip pre-fills the
  composer, the gear icon invokes onOpenSettings exactly once.
- Personas screen: seeded library renders the first defaults,
  empty-library placeholder shows the inviting copy, back button
  invokes onBack exactly once.

### Build it yourself

```bash
cd android-native
ANDROID_HOME=/opt/android-sdk ./gradlew testDebugUnitTest assembleDebug --no-daemon
```

### Phase 4+ backlog

Roundtable run-loop UI (turn-taking, mention-picker dropdown in the
composer, per-persona bubble tinting), manuscript paper sync, creator
memory, branching session tree, system file-picker glue for import/export.
