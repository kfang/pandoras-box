import { readFileSync } from "fs";
import yaml from "js-yaml";

export interface Config {
  github: {
    token: string;
    orgs: string[];
    repos: string[];
  };
  persistence: {
    type: "sqlite" | "backstage";
    sqlite?: {
      path: string;
    };
  };
  refresh: {
    interval: number;
    on_start: boolean;
  };
  server: {
    port: number;
    host: string;
  };
}

export function loadConfig(configPath: string): Config {
  const raw = readFileSync(configPath, "utf8");
  // Expand ${ENV_VAR} references
  const expanded = raw.replace(/\$\{([^}]+)\}/g, (_, name) => {
    const val = process.env[name];
    if (val === undefined) {
      console.warn(`Warning: environment variable ${name} is not set`);
      return "";
    }
    return val;
  });

  const parsed = yaml.load(expanded) as Record<string, unknown>;

  const github = parsed["github"] as Record<string, unknown>;
  const persistence = parsed["persistence"] as Record<string, unknown>;
  const refresh = (parsed["refresh"] as Record<string, unknown> | undefined) ?? {};
  const server = (parsed["server"] as Record<string, unknown> | undefined) ?? {};

  return {
    github: {
      token: (github["token"] as string) ?? "",
      orgs: (github["orgs"] as string[]) ?? [],
      repos: (github["repos"] as string[]) ?? [],
    },
    persistence: {
      type: (persistence["type"] as "sqlite" | "backstage") ?? "sqlite",
      sqlite: persistence["sqlite"] as { path: string } | undefined,
    },
    refresh: {
      interval: (refresh["interval"] as number) ?? 3600,
      on_start: (refresh["on_start"] as boolean) ?? true,
    },
    server: {
      port: (server["port"] as number) ?? 3000,
      host: (server["host"] as string) ?? "0.0.0.0",
    },
  };
}
