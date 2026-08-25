import { spawn } from "node:child_process";
import { resolve } from "node:path";

const cliPath = resolve("node_modules", "@playwright", "test", "cli.js");
const child = spawn(process.execPath, [cliPath, "test", "test/e2e/png-export-stress.spec.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    MMD_MODOKI_RUN_PNG_STRESS: "1",
  },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`PNG stress test terminated by ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
