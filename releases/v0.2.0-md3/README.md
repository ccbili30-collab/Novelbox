# TBird Roundtable Box — v0.2.0 MD3 redesign · debug builds

## 1. WebView build

`tbird-roundtable-md3-debug.apk` (app id `com.qinglan.chatnovel`)
The full legacy web app wrapped in a WebView. Source: `android-app/`
+ `index.html` + `src/`.

## 2. Native build (Kotlin + Jetpack Compose + Material 3)

`tbird-roundtable-native-debug.apk` — 16 MB
SHA-256: `43796e07a55b074a424993881e423ebf213ac53aeda5254f6925d5217ce95bff`
App id: `com.qinglan.chatnovel.native.debug`. Installable alongside #1.

### Features in this APK

- Material You dynamic color on Android 12+, light/dark/system fallback.
- Persistent session history (JSON-on-disk, atomic tmp+rename, mutex).
- Multiple sessions via M3 ModalNavigationDrawer.
- Auto title from the first user message.
- System prompt via M3 ModalBottomSheet — prepended to every API call.
- Streaming OpenAI Chat Completions with mid-stream abort.
- Persona library auto-seeded (设定 / 剧情 / 文风 / 质疑).
- Roundtable kernel (parseMentions / reorderForMentions / composeSystemPrompt) — pure + tested.
- Single-session import/export helpers.
- Edge-to-edge layout, IME-aware composer, splash + adaptive icon.

### Verified by 42 tests (37 JVM unit + 5 Robolectric Compose UI), 0 failures

```
AppPrefsTest          2
ChatMessageTest       2
PersonaStoreTest      6
RoundtableTest        9
SessionStoreTest     11
SessionTransferTest   7
ChatScreenUiTest      5  ← Robolectric + Compose UI
TOTAL                42
```

**ChatScreenUiTest** drives the real Compose tree on Robolectric — no
KVM-accelerated emulator required (the build sandbox has neither
`/dev/kvm` nor vmx/svm CPU flags so the standard Android emulator
can't run). The tests check semantic-tree invariants that mirror what
a real user sees:

1. **empty state** — headline + both suggestion chips visible.
2. **send disabled** — button is disabled when the composer is empty.
3. **typing enables send** — typing into the composer enables it.
4. **chip pre-fills composer** — tapping a suggestion writes its
   template into the input field.
5. **settings nav** — the gear icon invokes the supplied callback
   exactly once.

### Build it yourself

```bash
cd android-native
ANDROID_HOME=/opt/android-sdk ./gradlew testDebugUnitTest assembleDebug --no-daemon
```

### Phase 4+ backlog

UI surface for the roundtable orchestrator (turn-taking renderer,
mention picker dropdown, persona editor screen), manuscript paper
sync, creator memory, branching session tree, import/export glue
to the system file picker.
