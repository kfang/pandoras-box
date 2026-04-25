import type { VolumeMetadata } from "../types";

export interface MetadataWriter {
  write(meta: VolumeMetadata, dryRun: boolean): Promise<void>;
}
