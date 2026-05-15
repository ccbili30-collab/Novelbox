import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createScrollFollower,
  createLayoutApplier,
} from "../src/app/runtime/scroll-and-layout.js";

function fakeScroller({ height = 1000, top = 0, client = 200 } = {}) {
  return { scrollHeight: height, scrollTop: top, clientHeight: client };
}

test("shouldFollowBottom returns true when within threshold", () => {
  const s = fakeScroller({ height: 1000, top: 850, client: 200 }); // 1000-850-200 = -50 → < 90
  const f = createScrollFollower(s, 90);
  assert.equal(f.shouldFollowBottom(), true);
});

test("shouldFollowBottom returns false when far from bottom", () => {
  const s = fakeScroller({ height: 1000, top: 100, client: 200 }); // 1000-100-200 = 700
  const f = createScrollFollower(s, 90);
  assert.equal(f.shouldFollowBottom(), false);
});

test("scrollBottom is a no-op when scroller is null", () => {
  const f = createScrollFollower(null);
  assert.doesNotThrow(() => f.scrollBottom());
  assert.doesNotThrow(() => f.scrollBottom(true));
});

test("createLayoutApplier requires getLayout + getAppearance", () => {
  assert.throws(() => createLayoutApplier({ root: {}, body: {}, getAppearance: () => ({}) }), TypeError);
  assert.throws(() => createLayoutApplier({ root: {}, body: {}, getLayout: () => ({}) }), TypeError);
});

test("applyLayout writes 15+ CSS variables to root.style", () => {
  const written = {};
  const root = { style: { setProperty(k, v) { written[k] = v; } } };
  const layout = {
    composerMinHeight: 66, composerFontSize: 16,
    sendButtonSize: 40, toolButtonSize: 40,
    messageFontSize: 17, messageLineHeight: 150,
    assistantLeft: 12, messageSidePadding: 16, messageGap: 12,
    userBubblePadding: 10, metaFontSize: 12, footerGap: 8, moreButtonSize: 28,
  };
  const a = createLayoutApplier({
    root, body: { classList: { toggle() {} } },
    getLayout: () => layout, getAppearance: () => ({ backgroundDataUrl: "" }),
  });
  a.applyLayout();
  assert.equal(written["--composer-min-height"], "66px");
  assert.equal(written["--font-size"], "17px");
  assert.equal(written["--line-height"], "1.5");
  assert.equal(written["--user-bubble-padding-x"], "13px"); // round(10 * 1.3)
  assert.ok(written["--composer-max-textarea"]);
});

test("applySessionAppearance toggles body class only when background present", () => {
  const calls = [];
  const root = { style: { setProperty(k, v) { calls.push([k, v]); } } };
  const body = { classList: { toggle(name, on) { calls.push(["toggle", name, on]); } } };
  const a = createLayoutApplier({
    root, body,
    getLayout: () => ({}),
    getAppearance: () => ({ backgroundDataUrl: "" }),
  });
  a.applySessionAppearance();
  assert.deepEqual(calls.find((c) => c[0] === "toggle"), ["toggle", "has-session-background", false]);

  a.getAppearance = () => ({ backgroundDataUrl: "data:image/png;base64,abc" });
  // re-create with new getter:
  const b = createLayoutApplier({
    root, body,
    getLayout: () => ({}),
    getAppearance: () => ({ backgroundDataUrl: "data:image/png;base64,abc" }),
  });
  b.applySessionAppearance();
  assert.ok(calls.some((c) => c[0] === "toggle" && c[1] === "has-session-background" && c[2] === true));
});

test("applyLayout / applySessionAppearance are safe when root is null", () => {
  const a = createLayoutApplier({
    root: null, body: null,
    getLayout: () => ({}),
    getAppearance: () => ({ backgroundDataUrl: "" }),
  });
  assert.doesNotThrow(() => a.applyLayout());
  assert.doesNotThrow(() => a.applySessionAppearance());
});
