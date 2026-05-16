import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[2] || ".");
const outDir = resolve(process.argv[3] || "android-app/app/build/generated/assets/web");
const entry = resolve(root, "src/main.js");
const reverseEngineeringNoteText = [
  "解包这玩意干啥，1托ai诗山。",
  "看在作者这么辛苦的份上你就不能找作者要吗？",
  "vx:chenfuyvwo",
  "",
].join("\n");
const reverseEngineeringNote = `\uFEFF${reverseEngineeringNoteText}`;
const seen = new Set();
const ordered = [];
const importsByFile = new Map();
const exportsByFile = new Map();
const moduleNames = new Map();
const sealedPromptFiles = {
  T: process.env.TBIRD_SEALED_T_PROMPT_FILE || "",
  B: process.env.TBIRD_SEALED_B_PROMPT_FILE || "",
};
const presetPromptFile = process.env.TBIRD_PRESET_PROMPTS_FILE || "";

function toPosix(path) {
  return path.replace(/\\/g, "/");
}

function resolveImport(fromFile, specifier) {
  const target = specifier.endsWith(".js") ? specifier : `${specifier}.js`;
  return normalize(resolve(dirname(fromFile), target));
}

function parseNamedImports(source) {
  const imports = [];
  const pattern = /import\s*\{([\s\S]*?)\}\s*from\s*["'](.+?)["'];?/g;
  let match;
  while ((match = pattern.exec(source))) {
    const names = match[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const aliasMatch = item.match(/^(.+?)\s+as\s+(.+)$/);
        return aliasMatch
          ? { imported: aliasMatch[1].trim(), local: aliasMatch[2].trim() }
          : { imported: item, local: item };
      });
    imports.push({
      specifier: match[2],
      names,
    });
  }
  return imports;
}

function parseExports(source) {
  const exports = [];
  const pattern = /\bexport\s+(?:async\s+function|function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g;
  let match;
  while ((match = pattern.exec(source))) {
    exports.push(match[1]);
  }
  return exports;
}

function sealedKeyByte(index, seed, salt) {
  let value = (seed ^ ((index + 1) * 0x9e3779b1) ^ (salt[index % salt.length] << ((index % 4) * 8))) >>> 0;
  value ^= value << 13;
  value >>>= 0;
  value ^= value >>> 17;
  value >>>= 0;
  value ^= value << 5;
  return value & 255;
}

function encodeSealedPrompt(text) {
  const bytes = new TextEncoder().encode(text);
  const salt = Array.from(randomBytes(16));
  const seed = randomBytes(4).readUInt32LE(0) || 0x6d2b79f5;
  const data = Array.from(bytes, (byte, index) => byte ^ sealedKeyByte(index, seed, salt));
  return `{ seed: ${seed}, salt: [${salt.join(",")}], data: [${data.join(",")}] }`;
}

function readSealedPrompt(path) {
  return path ? readFileSync(resolve(path), "utf8") : "";
}

function readPresetPrompts() {
  if (!presetPromptFile) return null;
  const source = JSON.parse(readFileSync(resolve(presetPromptFile), "utf8").replace(/^\uFEFF/, ""));
  return source && typeof source === "object" ? source : {};
}

function buildSealedPromptModuleSource() {
  if (!sealedPromptFiles.T && !sealedPromptFiles.B) return "";
  const tPrompt = readSealedPrompt(sealedPromptFiles.T);
  const bPrompt = readSealedPrompt(sealedPromptFiles.B);
  return [
    "// Generated only inside the Android asset bundle.",
    "// Public source keeps sealed prompts empty; this block is casual unpacking resistance, not real secrecy.",
    "const __sealedTextDecoder = new TextDecoder();",
    "function __sealedKeyByte(index, seed, salt) {",
    "  let value = (seed ^ ((index + 1) * 0x9e3779b1) ^ (salt[index % salt.length] << ((index % 4) * 8))) >>> 0;",
    "  value ^= value << 13; value >>>= 0;",
    "  value ^= value >>> 17; value >>>= 0;",
    "  value ^= value << 5;",
    "  return value & 255;",
    "}",
    "function __sealedDecode(block) {",
    "  if (!block || !Array.isArray(block.data) || !block.data.length) return \"\";",
    "  const bytes = new Uint8Array(block.data.length);",
    "  for (let index = 0; index < block.data.length; index += 1) {",
    "    bytes[index] = block.data[index] ^ __sealedKeyByte(index, block.seed, block.salt);",
    "  }",
    "  return __sealedTextDecoder.decode(bytes);",
    "}",
    `const __SEALED_T_BLOCK = ${encodeSealedPrompt(tPrompt)};`,
    `const __SEALED_B_BLOCK = ${encodeSealedPrompt(bPrompt)};`,
    "const SEALED_T_PROMPT = __sealedDecode(__SEALED_T_BLOCK);",
    "const SEALED_B_PROMPT = __sealedDecode(__SEALED_B_BLOCK);",
  ].join("\n");
}

function buildPresetPromptModuleSource() {
  const prompts = readPresetPrompts();
  if (!prompts) return "";
  const entries = Object.entries(prompts)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => `${JSON.stringify(key)}: __sealedDecode(${encodeSealedPrompt(value)})`);
  return [
    "// Generated only inside the Android asset bundle.",
    "// Public source keeps preset creator prompts empty; this block is casual unpacking resistance, not real secrecy.",
    "const __sealedTextDecoder = new TextDecoder();",
    "function __sealedKeyByte(index, seed, salt) {",
    "  let value = (seed ^ ((index + 1) * 0x9e3779b1) ^ (salt[index % salt.length] << ((index % 4) * 8))) >>> 0;",
    "  value ^= value << 13; value >>>= 0;",
    "  value ^= value >>> 17; value >>>= 0;",
    "  value ^= value << 5;",
    "  return value & 255;",
    "}",
    "function __sealedDecode(block) {",
    "  if (!block || !Array.isArray(block.data) || !block.data.length) return \"\";",
    "  const bytes = new Uint8Array(block.data.length);",
    "  for (let index = 0; index < block.data.length; index += 1) {",
    "    bytes[index] = block.data[index] ^ __sealedKeyByte(index, block.seed, block.salt);",
    "  }",
    "  return __sealedTextDecoder.decode(bytes);",
    "}",
    `const PRESET_CREATOR_PROMPTS = { ${entries.join(", ")} };`,
  ].join("\n");
}

function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const source = readFileSync(file, "utf8");
  const imports = parseNamedImports(source);
  importsByFile.set(file, imports);
  exportsByFile.set(file, parseExports(source));
  imports.forEach((item) => visit(resolveImport(file, item.specifier)));
  moduleNames.set(file, `__tbird_mod_${moduleNames.size}`);
  ordered.push(file);
}

function importBindings(file) {
  const imports = importsByFile.get(file) || [];
  return imports
    .map((item) => {
      const dependency = resolveImport(file, item.specifier);
      const moduleName = moduleNames.get(dependency);
      const bindings = item.names
        .map((name) => name.imported === name.local ? name.imported : `${name.imported}: ${name.local}`)
        .join(", ");
      return `const { ${bindings} } = ${moduleName};`;
    })
    .join("\n");
}

function stripModuleSyntax(file) {
  const relative = toPosix(file.slice(root.length + 1));
  if (relative === "src/domain/roundtable/sealed-prompts.js") {
    const sealedSource = buildSealedPromptModuleSource();
    if (sealedSource) return sealedSource;
  }
  if (relative === "src/domain/roundtable/preset-prompts.js") {
    const presetSource = buildPresetPromptModuleSource();
    if (presetSource) return presetSource;
  }
  let source = readFileSync(file, "utf8");
  source = source.replace(/import\s*\{[\s\S]*?\}\s*from\s*["'].+?["'];?\s*/g, "");
  source = source.replace(/\bexport\s+(async\s+function|function|const|let|var|class)\b/g, "$1");
  return source.trim();
}

function moduleBlock(file) {
  const relative = toPosix(file.slice(root.length + 1));
  const bindings = importBindings(file);
  const source = stripModuleSyntax(file);
  if (file === entry) {
    return `\n// ${relative}\n${bindings ? `${bindings}\n` : ""}${source}\n`;
  }
  const moduleName = moduleNames.get(file);
  const exportNames = exportsByFile.get(file) || [];
  const returns = exportNames.join(", ");
  return `\n// ${relative}\nconst ${moduleName} = (() => {\n${bindings ? `${bindings}\n` : ""}${source}\nreturn { ${returns} };\n})();\n`;
}

visit(entry);

const bundle = `/*\n${reverseEngineeringNoteText}*/\n"use strict";\n(function () {\n${ordered.map(moduleBlock).join("\n")}\n})();\n`;
const html = readFileSync(resolve(root, "index.html"), "utf8")
  .replace(/\s*<a\b[^>]*\bdata-web-only\b[^>]*>[\s\S]*?<\/a>/g, "")
  .replace('<script type="module" src="./src/main.js"></script>', '<script src="./src/android-main.js"></script>');

mkdirSync(join(outDir, "src"), { recursive: true });
writeFileSync(join(outDir, "index.html"), html);
writeFileSync(join(outDir, "src/android-main.js"), bundle);
writeFileSync(join(outDir, "README_REVERSE_ENGINEERING.txt"), reverseEngineeringNote);
const assetsDir = resolve(root, "src/assets");
if (existsSync(assetsDir)) {
  cpSync(assetsDir, join(outDir, "src/assets"), { recursive: true });
}
