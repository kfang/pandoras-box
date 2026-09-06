import { execa } from "execa";

const sevenZipCmd = "7zz";

async function extractFile(archivePath: string, fileToExtract: string): Promise<string | undefined> {
  const { stdout } = await execa(sevenZipCmd, ["x", archivePath, fileToExtract, "-so"]);

  if (stdout) {
    return stdout;
  }

  return undefined;
}

export default { extractFile };

