/**
 * Material You theme engine.
 *
 * Capabilities:
 *   - Reads/writes a persisted theme preference: "light" | "dark" | "auto".
 *   - Applies it via the data-theme attribute on <html>; auto leaves the
 *     attribute unset so the prefers-color-scheme CSS kicks in.
 *   - Lets the user pick a "seed" color; we approximate an HCT-style
 *     tonal palette (tones 0/10/20/30/40/50/60/70/80/90/95/99/100) by
 *     blending the seed against black/white in HSL, then wire it into
 *     --md-ref-palette-primary*.
 *   - Updates <meta name=theme-color> so the mobile chrome bar matches.
 *
 * Storage keys:
 *   - tbird.theme.mode        : "light" | "dark" | "auto"
 *   - tbird.theme.seed        : "#rrggbb"
 */

const STORAGE_MODE = "tbird.theme.mode";
const STORAGE_SEED = "tbird.theme.seed";

const TONES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100];

function safeStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

/* ============== HSL/RGB helpers ============== */

function parseHex(input) {
  if (!input) return null;
  let h = String(input).trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function toHex({ r, g, b }) {
  const h = (v) => v.toString(16).padStart(2, "0");
  return "#" + h(Math.round(r)) + h(Math.round(g)) + h(Math.round(b));
}

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb({ h, s, l }) {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1 / 3) * 255,
  };
}

/**
 * Build a tonal palette of 13 stops by re-targeting the lightness of the
 * seed in HSL space. This is *not* the full HCT algorithm Google ships in
 * the material-color-utilities npm package, but it is a close visual
 * approximation that runs in ~0 KB.
 */
export function buildTonalPalette(seedHex) {
  const rgb = parseHex(seedHex);
  if (!rgb) return null;
  const { h, s } = rgbToHsl(rgb);
  // M3 tonal palettes are slightly desaturated at extremes — mirror that.
  const palette = {};
  for (const tone of TONES) {
    const l = clamp01(tone / 100);
    // Slight chroma roll-off at the very dark / very light ends.
    const chromaScale = tone <= 10 || tone >= 95 ? 0.7 : 1.0;
    palette[tone] = toHex(hslToRgb({ h, s: clamp01(s * chromaScale), l }));
  }
  return palette;
}

function applyPaletteToCss(prefix, palette) {
  if (!palette) return;
  const root = document.documentElement;
  for (const tone of TONES) {
    root.style.setProperty(`--md-ref-palette-${prefix}${tone}`, palette[tone]);
  }
}

function updateThemeColorMeta() {
  const styles = getComputedStyle(document.documentElement);
  const surface = styles.getPropertyValue("--md-sys-color-surface").trim()
                || (document.documentElement.dataset.theme === "dark" ? "#1c1b1f" : "#fffbfe");
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute("content", surface));
}

/* ============== Public API ============== */

export function getThemeMode() {
  return safeStorage()?.getItem(STORAGE_MODE) || "auto";
}

export function setThemeMode(mode) {
  const m = ["light", "dark", "auto"].includes(mode) ? mode : "auto";
  safeStorage()?.setItem(STORAGE_MODE, m);
  if (m === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", m);
  updateThemeColorMeta();
  return m;
}

export function getSeedColor() {
  return safeStorage()?.getItem(STORAGE_SEED) || "";
}

/**
 * Set the user's seed color (e.g. "#7d5260"). Pass an empty string to
 * fall back to the default palette baked into tokens.css.
 */
export function setSeedColor(hex) {
  const seed = parseHex(hex) ? hex : "";
  if (seed) {
    safeStorage()?.setItem(STORAGE_SEED, seed);
    const palette = buildTonalPalette(seed);
    applyPaletteToCss("primary", palette);
  } else {
    safeStorage()?.removeItem(STORAGE_SEED);
    // Re-apply the static palette by clearing inline overrides.
    const root = document.documentElement;
    for (const tone of TONES) root.style.removeProperty(`--md-ref-palette-primary${tone}`);
  }
  // Defer the meta update one frame so cascade has a chance to settle.
  requestAnimationFrame(updateThemeColorMeta);
}

export function initThemeEngine() {
  setThemeMode(getThemeMode());
  const seed = getSeedColor();
  if (seed) setSeedColor(seed);

  // React to system colour-scheme changes when the user picked "auto".
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (mq && typeof mq.addEventListener === "function") {
    mq.addEventListener("change", () => {
      if (getThemeMode() === "auto") updateThemeColorMeta();
    });
  }
}
