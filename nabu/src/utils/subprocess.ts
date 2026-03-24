export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Run a command and capture output. Throws on non-zero exit. */
export async function run(
  cmd: string[],
  opts?: { cwd?: string; quiet?: boolean }
): Promise<SpawnResult> {
  const proc = Bun.spawn(cmd, {
    cwd: opts?.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;

  if (!opts?.quiet && exitCode !== 0) {
    throw new Error(
      `Command failed: ${cmd.join(" ")}\nExit code: ${exitCode}\nStderr: ${stderr.trim()}`
    );
  }

  return { stdout, stderr, exitCode };
}

/** Run a command with stdout/stderr streaming to console. Returns exit code. */
export async function runWithProgress(
  cmd: string[],
  opts?: { cwd?: string }
): Promise<number> {
  const proc = Bun.spawn(cmd, {
    cwd: opts?.cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  return proc.exited;
}

/** Check if a command exists on PATH */
export async function commandExists(name: string): Promise<boolean> {
  const result = await run(["which", name], { quiet: true });
  return result.exitCode === 0;
}
