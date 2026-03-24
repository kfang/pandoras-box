import { z } from "zod";
import type { Strategy, PipelineContext, TalkBoundary } from "../types";
import { parseTimestamp } from "../utils/time";

const ManualEntrySchema = z.object({
  title: z.string(),
  speaker: z.string().default("Unknown"),
  startTime: z.union([z.string(), z.number()]),
  endTime: z.union([z.string(), z.number()]),
  description: z.string().optional(),
});

const ManualFileSchema = z.array(ManualEntrySchema);

export const manualStrategy: Strategy = {
  name: "manual",

  async analyze(ctx: PipelineContext): Promise<TalkBoundary[]> {
    const { manualFile } = ctx.config;

    if (!manualFile) {
      throw new Error("No manual file specified. Use --manual-file <path>.");
    }

    const file = Bun.file(manualFile);
    if (!(await file.exists())) {
      throw new Error(`Manual file not found: ${manualFile}`);
    }

    const raw = await file.json();
    const entries = ManualFileSchema.parse(raw);

    if (entries.length < 1) {
      throw new Error("Manual file contains no entries.");
    }

    console.log(`Loaded ${entries.length} entries from manual file.`);

    return entries.map((entry) => ({
      title: entry.title,
      speaker: entry.speaker,
      startTime: parseTimestamp(entry.startTime),
      endTime: parseTimestamp(entry.endTime),
      description: entry.description,
    }));
  },
};
