# TBird Roundtable Box — v0.2.0 MD3 redesign · debug build

**File:** `tbird-roundtable-md3-debug.apk`
**Size:** 504KB
**SHA-256:** `585779a5e6d45a2432a5d9a4d8a5bf2fd42f35e586d332252cfa3857b610fdcb`
**Branch:** `claude/material-you-redesign-YzYgV`
**Last rebuilt:** 2026-05-16 03:02 UTC (perf hotfix)

## Install
```
adb install -r tbird-roundtable-md3-debug.apk
```

## Manifest
| | |
|---|---|
| App id | `com.qinglan.chatnovel` |
| versionName | 0.1.0 |
| minSdk / target | 23 / 34 |

## Critical hotfix in this rebuild

The previous two drops looked OK but **no button on the page
responded to taps** on real Android devices.

Real root cause: the phase-6 / 18 / 21 teardown converted dozens
of legacy free-function declarations into `const` aliases. JS
`const` lives in a **temporal dead zone** until its initialiser
runs. main.js had:

  line 305: const assistantController = createAssistantController({ sessionSettings, ... });
  line 525: const sessionSettings = _ctx.sessionSettings;    ← used before declared!

On script load, the object literal at line 305 tried to read
`sessionSettings` and threw `ReferenceError: Cannot access
'sessionSettings' before initialization`. The throw aborted
main.js → `bindCommandDelegation` (the master `data-command`
click handler) was never wired → **every button silently failed**.

Fix:
1. Hoisted all 12 state-context aliases (activeSession,
   sessionSettings, sessionAppearance, sessionNovel,
   roundtableState, apiSettings, etc.) to right after
   `registerBridgeHooks`, BEFORE the controller construction
   block.
2. Converted 24 `const X = _X.method` aliases into hoisted
   `function` declarations (function declarations are
   thoroughly hoisted, so they resolve identifiers at CALL
   time not at construction time).
3. Same for `showToast` / `pulseElement` / `addMotionRipple`:
   wrapped in lazy hoisted functions that build the factory
   output on first call.
4. Same for `simpleHash`, `scheduleStreamDomUpdate`,
   `cancelStreamDomUpdate`.

Also added a node-side sim-loader that mounts minimal DOM/
window stubs and dynamically imports main.js to catch any
future top-level error. This caught a real bug that the
unit-test suite (165 module-level tests) couldn't see, because
none of the tests load main.js itself.

---

## Native build (Phase 1)

`tbird-roundtable-native-debug.apk` — **16 MB**, sha256
`96c673c4b42cd6aa8d371da29ca76c4c304e37d8464d58033736435d535bbae5`

Real **Kotlin + Jetpack Compose + Material 3** implementation. Lives in
`android-native/` (entirely separate from the WebView wrapper in
`android-app/`). App id: `com.qinglan.chatnovel.native.debug` — can
be installed alongside the WebView build for side-by-side comparison.

### What this build has

- Material 3 + **Material You dynamic color** (Android 12+ pulls from
  wallpaper). Toggleable in Settings.
- Light / Dark / Follow-system theme switch.
- Edge-to-edge layout, M3 top app bar, M3 composer with an animated
  send/stop FAB-style icon button, M3 empty state with suggestion chips.
- OpenAI-compatible Chat Completions client, streaming SSE deltas live
  into the assistant bubble (kotlinx.serialization, no third-party HTTP
  lib).
- DataStore-backed prefs for theme + API config.
- Splash screen + adaptive launcher icon.

### What this build does NOT have yet (Phase 2+)

The full web app has 7000+ LoC of business logic (multi-AI roundtable,
creator memory, branch session tree, manuscript sync, mention picker,
import/export, layout presets, sealed creator overlay, …). The native
build is at MVP only — one assistant, single linear conversation,
in-memory history. Those subsystems are deliberately out of scope for
the first commit.

### Build it yourself

```bash
cd android-native
ANDROID_HOME=/opt/android-sdk ./gradlew assembleDebug --no-daemon
```

Output: `android-native/app/build/outputs/apk/debug/app-debug.apk`.
