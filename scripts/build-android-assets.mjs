import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[2] || ".");
const outDir = resolve(process.argv[3] || "android-app/app/build/generated/assets/web");
const entry = resolve(root, "src/main.js");
const seen = new Set();
const ordered = [];
const importsByFile = new Map();
const exportsByFile = new Map();
const moduleNames = new Map();

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

const bundle = `"use strict";\n(function () {\n${ordered.map(moduleBlock).join("\n")}\n})();\n`;
const html = readFileSync(resolve(root, "index.html"), "utf8")
  .replace('<script type="module" src="./src/main.js"></script>', '<script src="./src/android-main.js"></script>');

mkdirSync(join(outDir, "src"), { recursive: true });
writeFileSync(join(outDir, "index.html"), html);
writeFileSync(join(outDir, "src/android-main.js"), bundle);
