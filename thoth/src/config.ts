import { z } from "zod";
import path from "path";
import os from "os";

const configSchema = z.object({
  path: z.string(),
  recursive: z.boolean().default(true),
  dryRun: z.boolean().default(false),
  format: z.enum(["cbz", "epub"]).optional(),
  cache: z.string().default(path.join(os.homedir(), ".thoth-cache.json")),
  interactive: z.boolean().default(true),
  clearCache: z.boolean().default(false),
});

export type Config = z.infer<typeof configSchema>;

export function buildConfig(opts: Record<string, unknown>): Config {
  return configSchema.parse(opts);
}
