/**
 * Wrap every standalone scripts/test-*.mjs as a node:test case so they
 * run inside `node --test` alongside the new test suite. Each legacy
 * script asserts at the top level; importing it executes those
 * assertions, so a thrown AssertionError fails the wrapping case.
 */
import { test } from "node:test";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const scriptsDir = join(here, "..", "scripts");

const legacyScripts = readdirSync(scriptsDir)
  .filter((name) => name.startsWith("test-") && name.endsWith(".mjs"))
  .sort();

for (const name of legacyScripts) {
  test(`legacy:${name}`, async () => {
    // Cache-bust each import so re-runs see a fresh module instance.
    const url = pathToFileURL(join(scriptsDir, name)).href + `?t=${Date.now()}`;
    await import(url);
  });
}
