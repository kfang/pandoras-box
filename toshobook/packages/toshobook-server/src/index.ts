import SevenZip from "7z-wasm";
import type { SevenZipModule, SevenZipModuleFactory } from "7z-wasm";
import fs from "node:fs/promises";

const FILENAME = "/mnt/f/Books/Anything's Possible with Ultimate Alchemy/Anything's Possible with Ultimate Alchemy v01 (Digital-Compilation) (Oak) (f).cbz";

await fs.readFile(FILENAME);

const archiveName = "archive.cbz";
const sZipMod: SevenZipModule = await (SevenZip as unknown as SevenZipModuleFactory)();
const stream = ZipMod.FS.open(archiveName, "w+");
sZipMod.FS.write(stream, buffer, offset, length)
sZipMod.callMain(["x", FILENAME]);

console.log("Hello World!");
