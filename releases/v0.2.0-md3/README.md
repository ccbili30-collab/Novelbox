# TBird Roundtable Box — v0.2.0 MD3 redesign · debug builds

This folder ships **two parallel debug APKs** built from the same branch.

## 1. WebView build

`tbird-roundtable-md3-debug.apk`
App id: `com.qinglan.chatnovel`. Full web app inside a WebView.
Source: `android-app/` + `index.html` + `src/`.

## 2. Native build (Kotlin + Jetpack Compose + Material 3)

`tbird-roundtable-native-debug.apk` — 16 MB
SHA-256: `3fb7fade4504c86d7a11bb582f4209c1146f2550976fd62a844f87fb1767fdd4`
App id: `com.qinglan.chatnovel.native.debug`. Installable alongside #1.

### Phase 2 + 3 features

- **Material You dynamic color** on Android 12+, light/dark/system fallback.
- **Persistent session history** at `filesDir/sessions/sessions.json`
  (atomic tmp+rename write, mutex-guarded). App restarts restore the list.
- **Multiple sessions** via M3 ModalNavigationDrawer.
- **Auto title** derived from the first user message (40-char clip + ellipsis).
- **System prompt** via M3 ModalBottomSheet — prepended to every API call.
- **Streaming OpenAI Chat Completions** with mid-stream abort.
- **Roundtable kernel** ready for UI: parseMentions / reorderForMentions /
  composeSystemPrompt, all pure + tested. UI surface comes online next phase.
- **Persona library** auto-seeded with 4 starter creators (设定 / 剧情 /
  文风 / 质疑) at `filesDir/personas/personas.json`.
- **Single-session import/export** helpers (round-trip JSON + safe filename).
- **Edge-to-edge**, IME-aware composer, empty state, suggestion chips,
  splash screen, adaptive icon.

### Verified by 37 JUnit unit tests, 0 failures

```
AppPrefsTest          2
ChatMessageTest       2
PersonaStoreTest      6
RoundtableTest        9
SessionStoreTest     11
SessionTransferTest   7
TOTAL                37
```

Coverage targets:
- Data layer: SessionStore (load / persist round-trip / upsert idempotent +
  sort / mutateOne / delete reassigns active / rename trim+reject-empty /
  setActive / corrupt-JSON resilience), PersonaStore (seed-on-empty
  toggle / upsert idempotent / delete / mutate / corrupt-JSON falls back
  to seed), SessionTransfer (round-trip / null on garbage / filename-safe).
- Model layer: ChatMessage factories / Session.deriveTitle (trim, clip,
  fallback) / AppPrefs.isApiReady.
- Roundtable kernel: parseMentions (ASCII + CJK case-insensitive,
  dedupe-preserving-order, unknown handle skipped), reorderForMentions
  (move-after-current, ignores already-spoken, returns-input on bad
  index), composeSystemPrompt (includes session+persona prompts + turn
  hint; collapses blank parts).

`./gradlew assembleDebug` → 16 MB universal debug APK.

### Phase 3+ backlog (not yet in APK)

UI surface for the roundtable orchestrator (the kernel is already
unit-tested), persona editor screen, mention-picker dropdown in
composer, manuscript paper sync, creator memory, branching session
tree. Each is a follow-up commit.

### Build it yourself

```bash
cd android-native
ANDROID_HOME=/opt/android-sdk ./gradlew testDebugUnitTest assembleDebug --no-daemon
```
