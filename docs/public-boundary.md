# Public Boundary

This repository intentionally keeps the product shell public and the roundtable core private.

## Public

- Visual shell
- Basic chat demo
- Android WebView wrapper
- Session and settings primitives
- API request helpers
- Design notes

## Private

- Roundtable turn scheduler
- Creator graph and memory federation
- Private creator templates
- Private prompts
- Production model routing
- Private APK artifacts

## APK Rule

Do not upload a private production APK to this public repository. APKs can be unpacked, and client-side JavaScript should be treated as visible to advanced users.

Use a public-shell APK for demos, and distribute the private APK only through controlled channels. Long term, move sensitive orchestration to a server if the core must remain confidential.
