export interface LintChildResult {
  status: number | null;
  signal: NodeJS.Signals | null;
}

export interface RunLintOptions {
  cwd?: string;
  platform?: NodeJS.Platform;
  nodeVersion?: string;
  prune?: boolean;
  readPressure?: () => string;
  runChild?: (
    command: string,
    args: string[],
    options: { cwd: string; stdio: "inherit" },
  ) => LintChildResult;
  resignal?: (signal: NodeJS.Signals) => void;
  logError?: (message: string) => void;
}

export function cacheFingerprint(options: {
  nodeVersion: string;
  files: ReadonlyArray<readonly [string, string | Uint8Array]>;
}): string;

export function lintInvocations(options: {
  cacheLocation: string;
  prune?: boolean;
}): string[][];

export function runLint(options?: RunLintOptions): number;
