# Roundtabox Public Shell

Roundtabox, also called 圆桌小说盒子, is a mobile-first AI writing workspace built around a new multi-creator roundtable metaphor.

This public repository contains the presentation shell and most non-core client code. It shows the interaction direction, mobile layout, ordinary writing surface, Android wrapper, API request utilities, session primitives, and design notes.

The roundtable core, creator-memory core, and private creator templates are still under active development, so this public branch keeps interface shells for those parts.

## What Is Public

- Mobile-first writing UI shell
- Ordinary chat and manuscript composition demo
- Session, settings, utility, API request, and Android wrapper code
- Public design notes for the roundtable writing direction
- Interface shells for the roundtable and creator modules

## Still In Development

- Roundtable orchestration core
- Private memory scheduling and creator identity graph
- Private creator templates
- Production prompt assembly

## Why

Roundtabox explores a post-chatbox writing workflow: instead of one assistant pretending to do everything, multiple AI creators can enter a shared roundtable, critique each other, and return to their own context with persistent memory.

The public shell demonstrates that product direction without exposing the core implementation.

## Run

```bash
node dev-server.mjs
```

Then open the printed local URL.

## Android

The Android wrapper can package this public shell. Full APK demos may be attached to releases while the roundtable source continues to evolve.
