import type { NabuConfig, StrategyName } from "./types";

export function buildConfig(opts: {
  url: string;
  strategy: string;
  output: string;
  conference?: string;
  date?: string;
  manualFile?: string;
  dryRun: boolean;
}): NabuConfig {
  const validStrategies = ["auto", "transcript", "manual"];
  if (!validStrategies.includes(opts.strategy)) {
    throw new Error(
      `Invalid strategy: ${opts.strategy}. Valid: ${validStrategies.join(", ")}`
    );
  }

  return {
    url: opts.url,
    outputDir: opts.output,
    strategy: opts.strategy as StrategyName,
    conferenceName: opts.conference,
    conferenceDate: opts.date,
    manualFile: opts.manualFile,
    dryRun: opts.dryRun,
  };
}
