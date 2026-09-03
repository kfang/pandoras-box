import { execa } from "execa";
import { glob, stat } from "node:fs/promises";
import path from "node:path";

const basePath = process.argv[2];
const sevenZipCmd = "7zz";

if (!basePath) {
  console.error("no basePath defined");
  process.exit(1);
}

async function* getCbzFiles(basePath: string): AsyncGenerator<string> {
  const pattern = path.join(basePath, "**/*.cbz");
  console.log(`looking for cbz files in ${pattern}`);

  const files = glob(pattern);
  for await (const file of files) {
    const fileStat = await stat(file);
    if (!fileStat.isFile()) {
      continue;
    }
    yield file;
  }
}

for await (const f of getCbzFiles(basePath)) {
  console.log(`extracting ComicInfo.xml from ${f}`)
  const { stdout } = await execa(sevenZipCmd, ["x", f, "ComicInfo.xml", "-so"]);
  console.log(stdout);
}
