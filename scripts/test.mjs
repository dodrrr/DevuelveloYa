import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
const files = readdirSync("tests")
  .filter((n) => n.endsWith(".test.ts"))
  .map((n) => `../../tests/${n}`);
const run = spawnSync(
  "pnpm",
  [
    "--filter",
    "@workspace/api-server",
    "exec",
    "node",
    "--import",
    "tsx",
    "--test",
    ...files,
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      APP_URL: "",
      DATABASE_URL: "postgres://test:test@127.0.0.1:1/dvy_test_not_used",
      POSTMARK_SERVER_TOKEN: "",
      POSTMARK_WEBHOOK_USER: "",
      POSTMARK_WEBHOOK_PASSWORD: "",
      CRON_SECRET: "",
      OPENAI_API_KEY: "",
      BRAVE_SEARCH_API_KEY: "",
    },
  },
);
process.exitCode = run.status ?? 1;
