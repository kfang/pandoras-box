import readline from "readline";

let rl: readline.Interface | null = null;

function getInterface(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });
  }
  return rl;
}

export function closePrompt(): void {
  rl?.close();
  rl = null;
}

export function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    getInterface().question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

export async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const suffix = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await ask(`${question} ${suffix} `);
  if (answer === "") return defaultYes;
  return answer.toLowerCase().startsWith("y");
}

export async function promptChoice(
  question: string,
  choices: string[]
): Promise<string> {
  const answer = await ask(`${question} [Y/n/search] `);
  if (answer === "" || answer.toLowerCase() === "y") return "accept";
  if (answer.toLowerCase() === "n") return "reject";
  return answer; // treat as search term
}
