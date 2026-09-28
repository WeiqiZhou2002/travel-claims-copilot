import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";
if (existsSync(".env.local")) loadEnvFile(".env.local");
const result = spawnSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "tests/intake-evals.test.ts",
    "tests/review-regressions.test.ts",
    "--testTimeout=60000",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", env: { ...process.env, RUN_LIVE_LLM_EVALS: "1" } },
);
process.exitCode = result.status ?? 1;
