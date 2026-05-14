# Roundtabox Public Shell

Roundtabox, also called 圆桌小说盒子, is a mobile-first AI writing workspace built around a new multi-creator roundtable metaphor.

This public repository is an open shell for product presentation and non-sensitive client code. It shows the interaction direction, mobile layout, ordinary writing surface, Android wrapper, API request utilities, session primitives, and design notes.

The private implementation is not included here.

## What Is Public

- Mobile-first writing UI shell
- Ordinary chat and manuscript composition demo
- Session, settings, utility, API request, and Android wrapper code
- Public design notes for the roundtable writing direction

## What Is Not Public

- Roundtable orchestration core
- Private memory scheduling and creator identity graph
- Private creator templates and private prompts
- Production APK built from the private client
- Any private prompt files or private model behavior rules

## Why

Roundtabox explores a post-chatbox writing workflow: instead of one assistant pretending to do everything, multiple AI creators can enter a shared roundtable, critique each other, and return to their own context with persistent memory.

The public shell demonstrates that product direction without exposing the core implementation.

## Run

```bash
node dev-server.mjs
```

Then open the printed local URL.

## Android

The Android wrapper can package this public shell, but public releases should only contain the public shell assets. A full private APK should not be uploaded to this public repository because APK files can be unpacked and inspected.
