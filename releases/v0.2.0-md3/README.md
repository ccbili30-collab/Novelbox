# TBird Roundtable Box — v0.2.0 MD3 redesign · debug build

**File:** `tbird-roundtable-md3-debug.apk`
**Size:** 519KB
**SHA-256:** `131ccc1ddf12ec6256d5e031a66dd1962de06a89992d1d4bcc02728252bb784c`
**Branch:** `claude/material-you-redesign-YzYgV`
**Last rebuilt:** 2026-05-16 01:46 UTC

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
