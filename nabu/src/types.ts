export interface TalkBoundary {
  title: string;
  speaker: string;
  startTime: number; // seconds
  endTime: number; // seconds
  description?: string;
}

export interface PipelineContext {
  config: NabuConfig;
  videoPath: string;
  subtitlePath?: string;
  subtitleLang: string;
  metadata: VideoMetadata;
  workDir: string;
}

export interface VideoMetadata {
  title: string;
  duration: number; // seconds
  subtitles: string[]; // available subtitle languages
}

export type StrategyName = "transcript" | "manual" | "auto";

export interface Strategy {
  name: StrategyName;
  analyze(ctx: PipelineContext): Promise<TalkBoundary[]>;
}

export interface NabuConfig {
  url: string;
  outputDir: string;
  strategy: StrategyName;
  conferenceName?: string;
  conferenceDate?: string;
  manualFile?: string;
  dryRun: boolean;
}
