import { Data, Effect, FileSystem } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import xxHash from "@node-rs/xxhash";


class ArchiveFileNotFound extends Data.TaggedError("ArchiveFileNotFound")<{
  readonly archivePath: string;
  readonly filePath: string;
}> { }


const sevenZipCmd = "7zz";

export const extractFileFromArchive = (archivePath: string, filePath: string) => Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const cmd = ChildProcess.make(sevenZipCmd, ["x", archivePath, filePath, "-so"]);
  const raw = yield* spawner.string(cmd);

  return raw
    ? yield* Effect.succeed(raw)
    : yield* Effect.fail(new ArchiveFileNotFound({ archivePath, filePath }));
});

export const calculateFileHash = (filepath: string) => Effect.gen(function* () {
  const filesys = yield* FileSystem.FileSystem;
  const buff = yield* filesys.readFile(filepath);

  const hasher = xxHash.xxh3.Xxh3.withSeed();
  hasher.update(buff);

  return hasher.digest().toString(16).padStart(16, "0");
});


