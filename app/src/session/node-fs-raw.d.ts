// Minimal ambient declaration for `node:fs`'s `readFileSync`, scoped to one
// test's need (task-3 review HIGH-1's structural CSS-token pin,
// `TimerTargets.test.tsx`). The client tsconfig (`tsconfig.app.json`)
// deliberately has no `"node"` in its `types` array — adding `@types/node`
// project-wide for one test is a far bigger blast-radius change than this
// needs, and risks masking real browser-vs-Node type mismatches elsewhere in
// `src/`. Reading `index.css`'s actual source text off disk is necessary
// because Vitest's own CSS handling for the "client" project (jsdom) mocks
// every `.css` import to an empty string — verified empirically for both
// `?raw` and `?inline` suffixes — so there is no ESM import path that
// returns real file content here.
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf-8"): string;
}
