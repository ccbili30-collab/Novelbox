# Codex Ubuntu Handoff

Last updated: 2026-05-16

## Workspace

- Windows source workspace: `D:\CodexW\TBird_Novelbox`
- Public repository: `https://github.com/ccbili30-collab/Novelbox`
- Private/full repository: `https://github.com/ccbili30-collab/TBird-Roundtabox`
- Public `main` currently contains public-safe code. Real preset prompt bodies are intentionally not committed.

## Current Product Direction

TBird / Novelbox is evolving from a Chatbox-like mobile AI writing tool into a roundtable-style personal creation system.

The core product idea:

- The user mainly talks to one `CreatorIdentity`, called the main creator.
- A session has exactly one main creator.
- `交流模式` and `圆桌模式` are two UI modes for the same session and the same main creator.
- Switching modes must not create a different main creator.
- Roundtable mode adds a writer surface and participant seats around the same creator context.
- Other creators can be invited into a roundtable as seats, but should not become fake independent creators.

## Key Domain Concepts

Use these names consistently in future code:

- `CreatorIdentity`: a real creator identity/persona with model config, avatar, settings, and memory pool.
- `Session`: a private one-on-one conversation with exactly one main creator.
- `RoundtableRoom`: a roundtable conversation attached to a session.
- `RoundtableSeat`: one creator's seat in a specific roundtable.
- `RoundtableRecord`: what a creator remembers about a specific roundtable.
- `MemoryPool`: long-term memory for one creator identity.
- `ModelBinding`: the model/provider config currently bound to a creator.
- `Writer`: a roundtable-only text organizer that inherits the main creator's model and writing style.

Avoid mixing these terms:

- `assistant`
- `member`
- `participant`
- `clone`
- `helper`

They may appear in legacy code, but new domain code should prefer the terms above.

## Architecture Lessons From AutoGen Review

The most useful pattern from AutoGen is not copying the library. It is the separation of responsibilities:

- UI emits user actions only.
- A manager/orchestrator decides who acts next.
- A context builder decides what each AI sees.
- A model client only calls the model API.
- Memory stores persist and retrieve remembered facts separately from visible chat history.

Applied to TBird:

- `RoundtableManager` should control start/end round, speaking order, mentions, and whether the main creator speaks.
- `CreatorContextBuilder` should assemble prompt, current messages, allowed memories, attachments, and roundtable records.
- `CreatorMemoryStore` should manage creator memory pools and roundtable records.
- UI code should not manually assemble full model context.

## Current Code Situation

The project is functional but has accumulated pressure:

- `src/main.js` is still very large and should be gradually split.
- `src/domain` already contains useful domain modules and should become the center of future architecture.
- CSS is large and mobile UI is sensitive to regressions.
- Android is currently a WebView shell.

Do not start by mass-renaming every variable. Preferred order:

1. Freeze terminology in docs.
2. Add tests around current behavior.
3. Move one responsibility at a time out of `src/main.js`.
4. Only rename inside the module currently being migrated.
5. Keep public/private prompt separation intact.

## Public/Private Prompt Rule

Public repository must not contain real preset or sealed prompt bodies.

Public-safe files:

- `src/domain/roundtable/sealed-prompts.js` should contain empty placeholders.
- `src/domain/roundtable/preset-prompts.js` in the public repository should contain only short public-safe placeholder prompts.

Local/private builds may inject real prompt bodies, but do not commit them to public.

## Suggested First Ubuntu Steps

After cloning on Ubuntu:

```bash
cd ~/CodexW/TBird_Novelbox
node --check src/main.js
node --check dev-server.mjs
node --check scripts/build-android-assets.mjs
```

Then start a new Codex/CLI session with:

```text
请先阅读 docs/CODEX_UBUNTU_HANDOFF.md 和 WORK_HANDOFF.md。
我们要继续 TBird / Novelbox 的系统化重构，先不要改功能。
目标是把 CreatorIdentity / Session / RoundtableRoom / RoundtableSeat / RoundtableRecord / MemoryPool / ModelBinding 这些概念固定下来，并逐步拆 src/main.js。
```

## Current Strategic Recommendation

Do not immediately rewrite everything in native Android.

Recommended path:

1. Use Ubuntu + CLI as the main development environment.
2. Stabilize the domain model and naming first.
3. Continue using the WebView implementation as a working validation surface.
4. Consider Kotlin/Jetpack Compose after the core rules are stable.

