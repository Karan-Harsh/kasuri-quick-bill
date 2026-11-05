// Stops `bun run dev` early, with a clear message, when real Node.js isn't available.
//
// Vite (the screens' dev server) needs Node. When `node` isn't on PATH, `bun run` quietly puts Bun in
// its place, and Vite then crashes on Bun a few seconds after starting (SIGTRAP, or
// "socket.destroySoon is not a function"). This script runs as `node`, so it can tell which one it got.
const MIN = [20, 19];

const fail = (problem) => {
  console.error(`\n✖ ${problem}
  Vite needs Node.js ${MIN.join(".")} or newer (Node 22 recommended).
  If you use nvm:  nvm install 22 && nvm alias default 22  — then open a new terminal tab.
  Otherwise install Node from https://nodejs.org and open a new terminal tab.\n`);
  process.exit(1);
};

if (process.versions.bun) fail("Node.js isn't on PATH in this terminal (Bun was used instead).");

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < MIN[0] || (major === MIN[0] && minor < MIN[1]))
  fail(`Node.js ${process.versions.node} is too old.`);
