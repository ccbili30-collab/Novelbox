import assert from "node:assert/strict";
import {
  PRESET_ROUNDTABLE_CREATORS,
  getPublicRoundtableCreatorTemplates,
  getRoundtableCreatorTemplateBase,
  isLockedRoundtableCreatorTemplateId,
  templateCodeForRoundtableCreator,
} from "../src/domain/roundtable/roundtable-model.js";

assert.equal(PRESET_ROUNDTABLE_CREATORS.length, 7);

const publicTemplates = getPublicRoundtableCreatorTemplates();
assert.equal(publicTemplates.length, PRESET_ROUNDTABLE_CREATORS.length);

const zhuangzhou = getRoundtableCreatorTemplateBase("preset-zhuangzhou");
assert.equal(zhuangzhou.name, "庄周");
assert.equal(zhuangzhou.visibility, "public");
assert.equal(zhuangzhou.avatarUrl, "./src/assets/preset-zhuangzhou.png");
assert.equal(isLockedRoundtableCreatorTemplateId(zhuangzhou.id), true);
assert.equal(templateCodeForRoundtableCreator(zhuangzhou.id), "zhuangzhou");

const expectedCodes = ["zhuangzhou", "aristotle", "libai", "falcon", "corvus", "y", "d"];
assert.deepEqual(PRESET_ROUNDTABLE_CREATORS.map((creator) => creator.code), expectedCodes);
assert.ok(PRESET_ROUNDTABLE_CREATORS.every((creator) => creator.prompt));
assert.ok(PRESET_ROUNDTABLE_CREATORS.every((creator) => creator.avatarUrl));

const y = getRoundtableCreatorTemplateBase("preset-y");
const d = getRoundtableCreatorTemplateBase("preset-d");
assert.equal(y.name, "Jesus");
assert.equal(d.name, "Emperor");
assert.equal(y.avatarUrl, "./src/assets/preset-y.png");
assert.equal(d.avatarUrl, "./src/assets/preset-d.png");

assert.equal(templateCodeForRoundtableCreator("sealed-t"), "T");
assert.equal(templateCodeForRoundtableCreator("sealed-b"), "B");

console.log("preset creator templates ok");
