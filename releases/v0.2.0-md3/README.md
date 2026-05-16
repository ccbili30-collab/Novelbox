# TBird Roundtable Box — v0.2.0 MD3 redesign · debug build

**File:** `tbird-roundtable-md3-debug.apk`
**Size:** 344KB
**SHA-256:** `1c1450d6e2f318b23ade9aceca55102b8bf6590f085e12ee0b99a8f4dc96b5ba`
**Branch:** `claude/material-you-redesign-YzYgV`
**Built:** 2026-05-16 01:10 UTC

## Install

```
adb install -r tbird-roundtable-md3-debug.apk
```

Or download the raw file from this folder and tap to install on the
device. First install will prompt to allow installs from this source
because the APK is signed with the standard Android debug keystore.

## Manifest

| | |
|---|---|
| App id        | `com.qinglan.chatnovel` |
| versionName   | 0.1.0 |
| minSdk        | 23 (Android 6.0) |
| targetSdk     | 34 (Android 14) |
| ABI           | universal (WebView shell, no native libs) |
| Signed by     | Android debug keystore |

## What's in this build

Bundles every commit on `claude/material-you-redesign-YzYgV`:

- Full Material You (MD3) design system: tokens, color palettes,
  elevation, shape, motion, type scale, state layers.
- 6 new MD3 components (snackbar, dialog, theme-engine, scroll-aware
  bar, keyboard help, what's new).
- Material You theme picker in settings → 外观 (light / dark / auto
  + 8 seed colors + custom color).
- 22-phase teardown of the legacy 7273-line main.js into 18 testable
  runtime modules + 2 view renderers. main.js is now 6742 lines.
- Performance: render() coalesced to rAF, persistState() debounced
  to idle frames, content-visibility on chat rows, M3 state layers
  replace per-tap flicker.
- Keyboard help dialog opens with `?`.

## Verification

Built locally with:

```
cd android-app
ANDROID_HOME=/opt/android-sdk ./gradlew assembleDebug --no-daemon
```

165 / 165 node:test cases green before the APK was assembled.
