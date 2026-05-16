# TBird Roundtable Box — v0.2.0 MD3 redesign · debug build

**File:** `tbird-roundtable-md3-debug.apk`
**Size:** 354KB
**SHA-256:** `97ff848bcdff42bbe93d056b9200c6d74ad3233819733611a629288bd334052d`
**Branch:** `claude/material-you-redesign-YzYgV`
**Last rebuilt:** 2026-05-16 01:17 UTC

## Install

```
adb install -r tbird-roundtable-md3-debug.apk
```

Or download the raw file from this folder on GitHub web and tap to
install. First install will prompt to allow installs from this
source because the APK is signed with the standard Android debug
keystore.

## Manifest

| | |
|---|---|
| App id        | `com.qinglan.chatnovel` |
| versionName   | 0.1.0 |
| minSdk        | 23 (Android 6.0) |
| targetSdk     | 34 (Android 14) |
| ABI           | universal (WebView shell, no native libs) |
| Signed by     | Android debug keystore |

## Changelog

Latest rebuild (this drop) fixes the on-device bug
"按键都点不动 / no button responds to clicks" reported against the
previous build. The phase-21 symmetrical-exit animation forced
hidden bottom panels into display:block; translateY(20px) which left
them stacked over the composer on Android WebView. The exit
animation is reverted to a clean display:none, the entrance
animation is preserved. Also fixes the doubled purple ring around
the model select dropdown.

Includes everything in the redesign branch:
- Full MD3 design system (tokens, palettes, elevation, motion,
  type scale, state layers).
- Material You theme picker in settings → 外观.
- 6 new MD3 components: snackbar, dialog, theme-engine, keyboard
  help, scroll-aware bar, what's new.
- 22-phase main.js teardown into 18 testable runtime modules + 2
  view renderers.
- 165 / 165 node:test cases green.

## Verification

Rebuilt locally with:

```
cd android-app
ANDROID_HOME=/opt/android-sdk ./gradlew assembleDebug --no-daemon
```
