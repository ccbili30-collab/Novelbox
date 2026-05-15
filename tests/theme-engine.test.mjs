import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTonalPalette } from "../src/ui/components/theme-engine.js";

test("buildTonalPalette returns 13 stops covering 0..100 tones", () => {
  const palette = buildTonalPalette("#6750a4");
  assert.ok(palette);
  for (const tone of [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100]) {
    assert.match(palette[tone], /^#[0-9a-f]{6}$/i, `tone ${tone} should be a hex string`);
  }
  assert.equal(palette[0].toLowerCase(), "#000000");
  assert.equal(palette[100].toLowerCase(), "#ffffff");
});

test("buildTonalPalette is order-preserving in lightness", () => {
  const palette = buildTonalPalette("#7d5260");
  const luminance = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) & 0xff) + ((n >> 8) & 0xff) + (n & 0xff);
  };
  const tones = [10, 20, 40, 60, 80, 90];
  for (let i = 1; i < tones.length; i += 1) {
    assert.ok(
      luminance(palette[tones[i]]) > luminance(palette[tones[i - 1]]),
      `tone ${tones[i]} must be brighter than tone ${tones[i - 1]}`
    );
  }
});

test("buildTonalPalette returns null for malformed input", () => {
  assert.equal(buildTonalPalette(""), null);
  assert.equal(buildTonalPalette("not a color"), null);
  assert.equal(buildTonalPalette("#zzz"), null);
});

test("buildTonalPalette accepts 3-digit hex", () => {
  const palette = buildTonalPalette("#abc");
  assert.ok(palette);
  assert.match(palette[40], /^#[0-9a-f]{6}$/i);
});
