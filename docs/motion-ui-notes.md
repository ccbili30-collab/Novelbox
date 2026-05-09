# Motion UI Notes

## Current Direction: Clean Breeze

The implemented motion pass aims for a clean, quiet writing surface that still feels alive under the finger.

- Buttons, menu items, message bubbles, and roundtable cards give immediate press feedback.
- Command buttons create a soft ink-like ripple from the touch point.
- Mobile devices get light haptic feedback through `navigator.vibrate` when available.
- Panels slide in from their real spatial direction: history from the left, settings/novel from the right, bottom sheets from the bottom.
- Toasts pop gently instead of appearing abruptly.
- Send/stop controls breathe during generation.
- Roundtable member selection has a small spring response.
- Roundtable messages and writer manuscript cards land softly onto the page.
- `@` mentions glow once so the eye catches the handoff between council members.
- Reduced-motion users keep the interface functional without animated movement.

## Alternate Direction: Paper Studio

This variant would make the manuscript more tactile:

- Paper grip stretches slightly during drag.
- Writer cards settle with a very small paper tilt.
- Accepted/revision badges would stamp onto the card.
- Manuscript sync could flash a short paper-edge highlight.

This is warmer and more object-like, but it risks making the clean UI feel too decorative.

## Alternate Direction: Meeting Room

This variant would make the roundtable feel more like an active meeting:

- Selected council members light up in speaking order.
- The active speaker avatar would pulse while the API call is running.
- Mention chains would draw attention with a short badge glow.
- The writer paper would subtly lift when `@写手` is invoked.

This is useful for clarity once long multi-council conversations become common.

## Guardrails

- Motion should confirm intent, not advertise itself.
- Nothing should block typing or reading.
- No bouncing layout shifts in the composer.
- Paper dragging must remain direct and unanimated while the finger is down.
- Every animation must have a reduced-motion fallback.
