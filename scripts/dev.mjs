import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(root, "node_modules", ".bin", "next");

const child = spawn(nextBin, ["dev", "--hostname", "127.0.0.1"], {
  stdio: "inherit",
  cwd: root,
  env: process.env,
});

function portOpen() {
  return new Promise((resolve) => {
    const socket = createConnection({ port: 3000, host: "127.0.0.1" }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    if (await portOpen()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

waitForServer().then((ready) => {
  if (!ready) return;
  spawn(
    "open",
    ["-a", "/Applications/Google Chrome.app", "http://127.0.0.1:3000/practice/scale"],
    {
      stdio: "ignore",
      detached: true,
    },
  ).unref();
});

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});
