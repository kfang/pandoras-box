import type { GitHubClient } from "./client.js";
import type { GhCodeOwnerEntry } from "./types.js";

const CODEOWNERS_PATHS = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"];

function decodeBase64(encoded: string): string {
  // atob is available in Node 16+ and all modern runtimes
  const decoded = atob(encoded);
  return decoded;
}

/**
 * Fetches the CODEOWNERS file content from a repo, checking the standard paths
 * (.github/CODEOWNERS, CODEOWNERS, docs/CODEOWNERS). Returns raw text or null
 * if no CODEOWNERS file exists.
 */
export async function fetchCodeOwnersFile(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<string | null> {
  for (const path of CODEOWNERS_PATHS) {
    try {
      const { data } = await client.repos.getContent({ owner, repo, path });
      if (!Array.isArray(data) && data.type === "file" && "content" in data) {
        return decodeBase64(data.content as string);
      }
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 404) continue;
      throw err;
    }
  }
  return null;
}

/**
 * Parses a CODEOWNERS file into structured entries.
 * Skips blank lines and comments. Each line is: `<pattern> <owner1> [<owner2> ...]`
 * Duplicate patterns are resolved last-match-wins (CODEOWNERS semantics).
 */
export function parseCodeOwners(content: string): GhCodeOwnerEntry[] {
  // Use a Map to deduplicate — last entry for a given pattern wins (CODEOWNERS semantics)
  const byPattern = new Map<string, string[]>();
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;

    const pattern = parts[0]!;
    const owners = parts.slice(1).filter((p) => !p.startsWith("#"));

    if (owners.length > 0) {
      byPattern.set(pattern, owners);
    }
  }
  return [...byPattern.entries()].map(([pattern, owners]) => ({ pattern, owners }));
}
