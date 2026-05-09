# Roundtable Novelbox / 圆桌小说盒子

A mobile-first AI workspace for long-form fiction writing.

One-line pitch: Roundtable Novelbox solves the problem that ordinary AI chat is hard to sustain for long novels by bringing conversation, manuscript memory, worldbuilding, plot lines, character notes, and a roundtable-style multi-assistant creation flow into one mobile writing desk.

Live demo: [https://ccbili30-collab.github.io/Novelbox/](https://ccbili30-collab.github.io/Novelbox/)

## Inspired By Conversation, Built For Novels

Roundtable Novelbox is inspired by the immediacy of chat-based AI tools: open it, write, revise, continue, and ask again without ceremony.

But it is not trying to be another generic chat client. Long-form fiction has different pain points: the manuscript grows too large, worldbuilding becomes scattered, character state drifts, and the model often loses track of what it should remember. Roundtable Novelbox keeps the directness of conversation while adding the writing memory a novel actually needs.

## Introducing Roundtable Co-Creation

Roundtable co-creation is now the core product direction of Novelbox.

Instead of forcing a long novel into a single chat thread, Novelbox lets the user gather several AI roles around the same manuscript:

- By default, the user writes with the main writer assistant in a simple chat flow.
- When discussion is needed, the user opens Roundtable Mode with the `圆` button.
- The manuscript becomes a draggable paper window near the top, like a page placed on the table.
- Below it, council members such as Worldbuilder, Plot Designer, Reviewer, Style Editor, and custom roles discuss the current draft.
- Selected council members speak in order and can read earlier comments without mixing up who said what.
- Council members can `@` one another, and mentioned members answer in sequence with loop protection.
- Each council member can have its own prompt, model, API settings, temperature, and material reading range.
- The user decides whether to adopt, rewrite, continue discussion, or `@Writer` to turn discussion back into prose.
- Writer output appears as manuscript text and is synced into the manuscript library, instead of being treated like an ordinary chat bubble.

This is the direction that makes Novelbox more than a chat UI: it becomes a personal post-AI writing room where different AI perspectives can argue, review, and help the human author keep control.

## Current Features

### Mobile Writing Chat

- Conversation-first interface.
- User messages on the right, AI messages on the left.
- Fixed bottom composer for mobile use.
- History, new session, duplicate session, and delete session.
- Assistant response version switching.
- User message editing.
- Real assistant output editing.

Assistant output editing changes the assistant message itself. Later context uses the edited version instead of treating the edit as a new prompt.

### Roundtable Mode

- One-tap switch between normal writing chat and Roundtable Mode.
- Paper-like manuscript window placed above the discussion area.
- Smooth drag to expand or fold the manuscript paper.
- `参会人` panel for selecting and editing council members.
- Built-in council members: Worldbuilder, Plot Designer, Reviewer, Style Editor, and Writer.
- Add, modify, hide, and delete council members.
- Ordered speaking: selected council members respond one by one.
- Council-to-council `@` mentions with sequential follow-up replies.
- Per-council-member prompts, models, API configuration, temperature, and material settings.
- Global and per-member material scope: manuscript, main chat, roundtable history, plot line, characters, worldbuilding, outline, and foreshadowing.
- Writer replies are displayed as manuscript blocks and synced to the manuscript library.

### OpenAI-Compatible API

- Base URL.
- API Key.
- Model name input.
- Model list fetching.
- Temperature, context count, unlimited context, and max output tokens.
- Streaming output.
- Stop generation.

The app does not fake local generation. If the API is missing or invalid, it reports the error.

### Novel Memory

The novel panel stores:

- Manuscript library.
- Plot line.
- Character cards.
- Worldbuilding.
- Outline.
- Foreshadowing notes.

These fields are not decorative. They are included in the context preview and sent to the real API request.

### Manuscript Import And Export

- Import TXT manuscript.
- Export TXT manuscript.
- Use manuscript content as memory material.
- Send tail excerpts by default to avoid overloading context.

### AI Material Summaries

Each material area can be filled by AI:

- Plot line summary.
- Character cards.
- Worldbuilding.
- Outline.
- Foreshadowing notes.

These features call the configured API. They are not mocked.

### Context Preview

Before sending, users can inspect:

- System prompt.
- Novel memory.
- Recent conversation.
- Current input.
- Estimated tokens.
- Model and temperature.

For long-form writing, this matters because users need to know what the model can actually see.

### Layout Tuning

The app includes mobile layout tuning:

- Composer height.
- Composer font size.
- Send button size.
- Tool button size.
- Message font size.
- Line height.
- Assistant left offset.
- Message side padding.
- Message gap.
- User bubble padding.
- Metadata font size.
- More button size.

Users can apply compact or comfortable presets, save custom presets, copy layout parameters, and reset defaults.

## Android

The repository includes an Android WebView wrapper:

```text
android-app/
```

Build debug APK:

```bash
cd android-app
./gradlew assembleDebug
```

Windows:

```powershell
cd android-app
.\gradlew.bat assembleDebug
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

## Status

Completed:

- Mobile-first writing chat.
- OpenAI-compatible API.
- Streaming and stop generation.
- Session history.
- Direct assistant output editing.
- Context preview.
- Novel material panel.
- TXT import/export.
- AI material summaries.
- Android APK project.
- Layout tuning and custom presets.
- Roundtable Mode with manuscript paper, council members, ordered replies, per-member settings, and `@` follow-ups.

Planned:

- Finer chapter management.
- Manuscript anchors.
- Searchable manuscript memory.
- Confirmation flow for generated materials.
- Cleaner approval flow for accepting or rejecting council suggestions.

## Final Line

Roundtable Novelbox is not just a chat shell. It is a personal AI fiction creator where the writer, worldbuilder, plot designer, reviewer, and user can gather around the same manuscript.
