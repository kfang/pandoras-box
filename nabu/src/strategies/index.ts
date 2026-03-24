import type { Strategy, StrategyName, PipelineContext, TalkBoundary } from "../types";
import { transcriptHeuristicStrategy } from "./transcript-heuristic";
import { manualStrategy } from "./manual";

const strategies: Record<string, Strategy> = {
  transcript: transcriptHeuristicStrategy,
  manual: manualStrategy,
};

const FALLBACK_ORDER: StrategyName[] = ["transcript", "manual"];

export function getStrategy(name: StrategyName): Strategy {
  const strategy = strategies[name];
  if (!strategy) throw new Error(`Unknown strategy: ${name}`);
  return strategy;
}

/** Try strategies in fallback order until one succeeds */
export async function autoDetect(
  ctx: PipelineContext
): Promise<{ strategy: StrategyName; boundaries: TalkBoundary[] }> {
  for (const name of FALLBACK_ORDER) {
    // Skip manual in auto mode (requires explicit file)
    if (name === "manual" && !ctx.config.manualFile) continue;

    const strategy = strategies[name];
    console.log(`\nTrying strategy: ${name}...`);

    try {
      const boundaries = await strategy.analyze(ctx);
      console.log(`Strategy "${name}" succeeded with ${boundaries.length} talks.`);
      return { strategy: name, boundaries };
    } catch (err) {
      console.log(
        `Strategy "${name}" failed: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  throw new Error(
    "No strategy could detect talk boundaries. Try providing a manual file with --manual-file."
  );
}
