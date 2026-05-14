# Roundtabox

Roundtabox, also called 圆桌小说盒子, is a mobile-first AI fiction workspace built around multi-creator roundtable writing.

The roundtable direction is already implemented in the Android demo. You can enter roundtable mode, invite AI creators into the room, discuss the same story with them, and keep the manuscript visible above the conversation like a sheet of paper on the table.

This public repository keeps most ordinary client code visible: the mobile writing UI, Android WebView shell, OpenAI-compatible request layer, session basics, layout/state utilities, and public module boundaries. A few competitive parts are intentionally represented by interfaces while they continue to iterate privately: roundtable turn orchestration, creator identity and memory federation, private creator templates, and production prompt assembly.

## What It Solves

Single-AI writing tools often collapse every job into one voice. Roundtabox turns AI writing into a small creative room: the user hosts the work, AI creators discuss, challenge, refine, and the writer channel turns decisions into prose.

## What You Can Try Now

- Chat with the main creator in ordinary writing mode.
- Switch into roundtable mode.
- Talk with multiple AI creators around one story.
- Keep the manuscript visible while the discussion continues below it.
- Use your own OpenAI-compatible Base URL, API Key, and model.
- Install the Android APK demo from Releases.

## Source Boundary

The public source is not a fake landing page. It shows the actual product shell and most non-core implementation. The withheld pieces are the parts that define Roundtabox's competitive behavior:

- Roundtable turn scheduling and participant coordination
- Creator identity, clone, and long-memory federation
- Private/hidden creator templates
- Production prompt assembly

When asked about the missing internals: the public repository exposes the shape of the system, while the production roundtable core is still being refined privately. The Android APK demo contains the working roundtable experience.

## APK

Download the latest APK from [Releases](https://github.com/ccbili30-collab/Novelbox/releases).

No API key is bundled. Users must enter their own OpenAI-compatible API endpoint, API key, and model inside the app.

## Run The Public Client

```bash
node dev-server.mjs
```

Then open the printed local URL.
