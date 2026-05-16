# TBird Roundtable Box — v0.2.0 MD3 redesign · debug builds

This folder ships **two parallel debug APKs** built from the same branch:

## 1. WebView build (legacy web prototype wrapped in Android)

`tbird-roundtable-md3-debug.apk` —
SHA-256: `585779a5e6d45a2432a5d9a4d8a5bf2fd42f35e586d332252cfa3857b610fdcb`,
Size: 504KB

App id `com.qinglan.chatnovel`. Wraps the full web app (multi-AI
roundtable / creator memory / branching session tree / manuscript sync /
…) in a WebView. Loads `index.html` + all of `src/` from APK assets.

Source: `android-app/` + `index.html` + `src/`.

## 2. Native build (Kotlin + Jetpack Compose + Material 3)

`tbird-roundtable-native-debug.apk` —
SHA-256: `24903505c7ef4fbcd1ee5b82c3f8b1fb67244dabfe90ccaed8742d57bad8ccd9`,
Size: 16MB

App id `com.qinglan.chatnovel.native.debug` — distinct, so both can be
installed side by side for direct A/B.

### Phase 2 features in this build

- Material You dynamic color (Android 12+) with light/dark/system fallback.
- **Persistent session history**: every conversation is auto-saved to
  `filesDir/sessions/sessions.json`. App restarts restore the list +
  pick up the most recent session.
- **Multiple sessions**: tap the hamburger to open a Material 3
  ModalNavigationDrawer listing every saved session by most-recent-first.
  Active session pulls the secondary-container highlight. Delete and
  switch from the drawer.
- **Auto title**: the first user message becomes the session title
  (trimmed + clipped to 40 chars + ellipsis).
- **System prompt**: top-bar chat icon opens a M3 ModalBottomSheet
  with a multi-line OutlinedTextField. Saves to the active session and
  is prepended on every API call.
- **Streaming OpenAI Chat Completions** with abort: SSE deltas append to
  the placeholder bubble live; Stop cancels mid-stream and freezes the
  partial text in place. Failed responses get the error-container tone.
- **Empty state** with two SuggestionChip starters that pre-fill the
  composer.
- **M3 composer card** with extra-large top corners, surface-container
  background, send/stop FilledIconButton that animates between modes,
  IME-aware (composer floats above the keyboard).
- Settings page: light/dark/system segmented switch, dynamic color
  toggle, Base URL / API Key / Model ID OutlinedTextFields + save.

### Verification

- `./gradlew testDebugUnitTest` runs **15 JUnit + kotlinx-coroutines-test
  cases**, all green:
  - SessionStore: empty-load, persist+reload round-trip, upsert idempotent
    + sort, mutateOne, delete reassigns active, rename trims + rejects
    empty, setActive flips pointer, corrupt JSON yields empty store.
  - Session.deriveTitle: trims first user message, clips to 40 chars,
    falls back to existing title when no user message present.
  - ChatMessage: factory functions mark role + flags correctly.
  - AppPrefs: default values + isApiReady gate.
- `./gradlew assembleDebug` builds the APK in ~15 s.

### What this build still does NOT have (Phase 3+ backlog)

Multi-AI roundtable orchestration / creator memory / branching session
tree / manuscript paper / mention picker / import-export / layout
presets / sealed creator overlay. Each one is its own dedicated chunk
and intentionally out of scope until the single-chat surface is
proven stable on real devices.

### Build it yourself

```bash
cd android-native
ANDROID_HOME=/opt/android-sdk ./gradlew testDebugUnitTest assembleDebug --no-daemon
```
