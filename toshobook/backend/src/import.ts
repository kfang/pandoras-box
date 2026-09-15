import { Console, Effect, FileSystem, Option, Path } from "effect";
import { calculateFileHash } from "./utils.ts";

export const processImportFile = (archivepath: string) => Effect.gen(function* () {
  const log = yield* Console.Console;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const fStat = yield* fs.stat(archivepath);
  if (fStat.type !== "File") {
    return;
  }

  const fileName = path.basename(archivepath);
  const fileHash = yield* calculateFileHash(archivepath);
  const fileBytes = fStat.size;
  const fileMTime = Option
    .map(fStat.mtime, (d) => d.toISOString())
    .pipe(Option.getOrUndefined);

  log.info(archivepath);
  log.info(`\tname: ${fileName}`);
  log.info(`\tsize: ${fileBytes} bytes`);
  log.info(`\thash: ${fileHash}`);
  log.info(`\tmtim: ${fileMTime}`);
});

