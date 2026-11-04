// Compiles the local server (server/main.ts) into a single executable that Tauri bundles
// as a "sidecar". Tauri requires the file name to end with the target's Rust triple.
//
//   bun scripts/build-server.ts            -> for this computer
//   bun scripts/build-server.ts windows    -> Windows x64 (can be built from macOS/Linux)
import { $ } from "bun";

const TARGETS = {
  windows: { bun: "bun-windows-x64", triple: "x86_64-pc-windows-msvc", ext: ".exe" },
  "win32-x64": { bun: "bun-windows-x64", triple: "x86_64-pc-windows-msvc", ext: ".exe" },
  "darwin-arm64": { bun: "bun-darwin-arm64", triple: "aarch64-apple-darwin", ext: "" },
  "darwin-x64": { bun: "bun-darwin-x64", triple: "x86_64-apple-darwin", ext: "" },
  "linux-x64": { bun: "bun-linux-x64", triple: "x86_64-unknown-linux-gnu", ext: "" },
} as const;

const key = (process.argv[2] ?? `${process.platform}-${process.arch}`) as keyof typeof TARGETS;
const target = TARGETS[key];
if (!target) {
  console.error(`Unsupported target "${key}". Use one of: ${Object.keys(TARGETS).join(", ")}`);
  process.exit(1);
}

const outfile = `src-tauri/binaries/kasuri-server-${target.triple}${target.ext}`;
await $`bun build server/main.ts --compile --minify --target=${target.bun} --outfile ${outfile}`;
console.log(`Built ${outfile}`);
