import { Effect, FileSystem } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import xxHash from "@node-rs/xxhash";

const sevenZipCmd = "7zz";

export const extractFileFromArchive = (archivePath: string, filePath: string) => Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const cmd = ChildProcess.make(sevenZipCmd, ["x", archivePath, filePath, "-so"]);
  return yield* spawner.string(cmd);
});

export const calculateFileHash = (filepath: string) => Effect.gen(function* () {
  const filesys = yield* FileSystem.FileSystem;
  const buff = yield* filesys.readFile(filepath);

  const hasher = xxHash.xxh3.Xxh3.withSeed();
  hasher.update(buff);

  return hasher.digest().toString(16).padStart(16, "0");
});


