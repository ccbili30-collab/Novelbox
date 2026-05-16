# TBird Roundtable Box — v0.2.0 MD3 redesign · debug builds

## 1. WebView build
`tbird-roundtable-md3-debug.apk` (app id `com.qinglan.chatnovel`) — legacy
web app inside a WebView. Source: `android-app/`.

## 2. Native build (Kotlin + Jetpack Compose + Material 3)
`tbird-roundtable-native-debug.apk` — 16 MB
SHA-256: ``
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
- **@-mention picker (Phase 6)** ☆ new — in roundtable mode, typing
  `@` (or `@xxx` partial) inside the composer pops a M3 list of
  matching personas. Tapping a row replaces `@partial` with
  `@<full-name> ` and positions the caret after the trailing space.
- CI workflow runs `./gradlew testDebugUnitTest` + `assembleDebug` on
  every push, uploads the test report and APK as artifacts.

### Verified by 60 tests (49 JVM unit + 11 mention resolver), 0 failures

```
AppPrefsTest                         2
ChatMessageTest                      2
PersonaStoreTest                     6
RoundtableTest                       9
SessionStoreTest                    11
SessionTransferTest                  7
MentionResolverTest                 11   ← new (Phase 6)
ChatScreenUiTest                     5   ← Robolectric + Compose UI
ChatViewModelRoundtableTest          4   ← Robolectric + VM state
PersonasScreenUiTest                 3   ← Robolectric + Compose UI
─────────────────────────────────────
TOTAL                               60
```

MentionResolverTest coverage:
- Empty / off-fragment caret returns null
- Caret immediately after `@` returns empty partial
- Caret inside ASCII fragment returns partial
- Caret inside CJK fragment returns partial
- Whitespace before caret kills the fragment
- candidatesFor: empty partial → first N (limit)
- Prefix match is case-insensitive
- Substring fallback when no prefix matches
- Unknown partial → empty list
- insertMention replaces fragment + trailing space + caret position
- insertMention handles CJK names

### Build it yourself

```bash
cd android-native
ANDROID_HOME=/opt/android-sdk ./gradlew testDebugUnitTest assembleDebug --no-daemon
```

Or push to a branch and let CI handle it (`.github/workflows/ci.yml`
now ships a `android-native` job that runs tests + builds + uploads
the APK as an artifact).

### Phase 7+ backlog

Manuscript paper sync, creator memory (per-persona long-term knowledge),
branching session tree, system file-picker glue for import/export,
roundtable round-pause/resume controls.
