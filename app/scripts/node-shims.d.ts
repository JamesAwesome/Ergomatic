// Minimal ambient declarations for the Node builtins library-balance.ts
// needs to read its frozen JSON literal and locate itself on disk. Same
// rationale as `src/session/node-fs-raw.d.ts`: `tsconfig.app.json`
// (which builds `scripts/`, alongside the browser-only `pm5-lab.ts`)
// deliberately has no `"node"` in its `types` array — pulling in the full
// `@types/node` project-wide for one script is a far bigger blast-radius
// change than this needs, and risks masking real browser-vs-Node type
// mismatches elsewhere in `src/`. Each declaration below covers exactly
// the surface `library-balance.ts` calls, nothing more. Deliberately NOT
// a global `declare const process` (that would leak a Node global into
// every browser file this tsconfig also builds) — the script casts
// `globalThis` locally instead.
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf-8"): string;
}
declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...parts: string[]): string;
}
declare module "node:url" {
  export function fileURLToPath(url: string): string;
  export function pathToFileURL(path: string): { href: string };
}
