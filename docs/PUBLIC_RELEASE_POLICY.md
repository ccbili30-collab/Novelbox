# Public Release Policy

This project has two release surfaces:

- **Private full workspace**: the complete development code, private roundtable implementation experiments, local sealed creator templates, and release tooling.
- **Public source workspace**: the shareable product direction, ordinary app shell, non-sensitive UI/business code, documentation, and public demo material.

## Public By Default

These parts can be public:

- Normal chat and writing workspace code.
- General UI components, styles, and mobile layout work.
- Import/export, session history, workspace material, markdown rendering, and Android wrapper code.
- README, product vision, issue notes, and implementation plans that do not expose private prompts or private roundtable internals.

## Private By Default

These parts stay private:

- Roundtable core orchestration that represents product-specific implementation advantage.
- Sealed/private creator prompt contents.
- Any local prompt files, API keys, personal test data, and local machine paths.
- Experimental code that exposes unfinished internal memory or creator-routing mechanics before it has a public-safe shell.

## APK Rule

The APK may include the full product experience, but sealed creator prompts should not appear as plaintext in unpacked assets.

For local full APK builds, provide prompt file paths through environment variables before running Gradle:

```powershell
$env:TBIRD_SEALED_T_PROMPT_FILE="C:\Users\16014\Desktop\T.md"
$env:TBIRD_SEALED_B_PROMPT_FILE="C:\Users\16014\Desktop\B.md"
cd D:\CodexW\TBird_Novelbox\android-app
.\gradlew.bat assembleDebug --offline --no-daemon
```

The Android asset bundler will inject those prompts into `android-main.js` as obfuscated numeric payloads. This is unpacking resistance, not cryptographic secrecy: a determined reverse engineer can still recover runtime data from an offline APK.

## Public Repo Tone

The public README can be generous about the product direction and most implementation work. For private roundtable internals, say plainly that the public version keeps the core behind a shell while it is still being cleaned up.

Suggested wording:

> The roundtable direction is real and already usable in the app. Some core orchestration code is kept out of the public source for now because the author is still cleaning up a one-person, one-ton AI poetry mountain. It is not a purity test or fake open source; it is just not ready to be thrown at contributors as-is.

