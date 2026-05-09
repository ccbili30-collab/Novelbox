import { clean } from "../../utils/text.js";
import { estimateTokens } from "../../utils/tokens.js";
import { buildNovelMemory } from "./novel-context-builder.js";

export function buildNovelStats(novel) {
  return {
    bodyLength: clean(novel.body).length,
    plotlineLength: clean(novel.plotline).length,
    memoryTokens: estimateTokens(buildNovelMemory(novel)),
  };
}
