# TBird Roundtable Box / TBird 圆桌盒子

**Next-generation AI conversation and creation workspace.**

One-line pitch: **turn inspiration, emotions, and viewpoints into finished work through roundtable conversations with different AIs, different voices, and different souls.**

Live demo: [https://ccbili30-collab.github.io/Novelbox/](https://ccbili30-collab.github.io/Novelbox/)

## New Direction

TBird Roundtable Box is moving beyond a Chatbox-like single-assistant writing tool.

The product is becoming a mobile-first AI roundtable workspace where the user can invite multiple AI participants into the same conversation, let them speak in order, challenge one another, respond to `@` mentions, and help turn scattered thoughts into concrete output.

Fiction writing is still the first strong use case, but it is no longer the product boundary. A roundtable can discuss a novel, a product idea, a personal question, a design direction, a speech, an essay, a worldbuilding problem, or an emotional knot. The output can be prose, a summary, an article, a plan, a manuscript section, or a decision record.

The core idea is simple:

> The user does not just ask one AI for an answer.
> The user brings several AIs into a room, lets them think together, and decides what becomes work.

## What Makes It Different

- **Group conversation instead of single chat.** Participants can be selected, ordered, mentioned, and brought into the next round.
- **AI roles are preferences, not cages.** A participant may prefer structure, emotion, criticism, worldbuilding, writing, or review, but the system should not force it into a narrow tool function.
- **Writer as a flexible drafter.** The writer can write fiction when asked, but in ordinary discussion it can summarize views, shape an article, or organize language.
- **Human keeps control.** AIs may argue, suggest, summarize, and draft; the user decides what to adopt.
- **Mobile-first workflow.** The interface is designed for quick capture, long conversations, and focused creation on a phone.
- **Creation memory.** Manuscript, notes, worldbuilding, outlines, character notes, and foreshadowing fields remain available as optional context material.

## Current Features

### Conversation Workspace

- Mobile-first chat interface.
- Session history, new session, duplicate session, and delete session.
- User message editing.
- Direct assistant output editing.
- Assistant response version switching.
- OpenAI-compatible API configuration.
- Model list fetching.
- Temperature, context count, unlimited context, and max output tokens.
- Stop generation.
- Low-flicker streaming: streaming updates are batched and only update the active message node.

### Roundtable Mode

- One-tap switch between normal conversation and Roundtable Mode.
- Manuscript / draft paper window placed above the discussion area.
- Draggable paper height and collapse behavior.
- Participant settings panel attached to the bottom composer layer.
- Select participants by ordered number.
- Start a round and let selected participants speak in order.
- `@` mention picker for bringing selected participants into the next turn sequence.
- Mention queue behavior: multiple mentions can enqueue multiple participants.
- Per-participant prompt, model, API base URL, API key, temperature, max tokens, and visible material scope.
- Failure isolation: one participant failing should not kill the whole round.
- Social activation layer for participants that should interpret meeting dynamics more naturally.

### Creation Memory

The project still includes a creation material panel for long-form work:

- Manuscript / body.
- Plot line.
- Character notes.
- Worldbuilding.
- Outline.
- Foreshadowing notes.
- TXT import and export.
- AI-assisted material summaries.
- Context preview with estimated tokens.

These are now best understood as **optional meeting materials**, not proof that the whole product is only a novel tool.

### Android

The repository includes an Android WebView wrapper:

```text
android-app/
```

Build debug APK:

```powershell
cd android-app
.\gradlew.bat assembleDebug --offline --no-daemon
```

APK output:

```text
android-app/app/build/outputs/apk/debug/app-debug.apk
```

## Local Web Demo

```bash
node dev-server.mjs
```

Default URL:

```text
http://127.0.0.1:5177/
```

## Product Line

**TBird Roundtable Box is an AI roundtable for turning inner material into outer work: inspiration, emotion, viewpoints, drafts, arguments, and decisions.**

It is not just a chat shell. It is a place to think with different AIs and let the conversation become something you can keep.
