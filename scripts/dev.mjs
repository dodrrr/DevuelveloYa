import { spawn } from "node:child_process";

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
function run(args, env) {
  const child = spawn("pnpm", args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code || 0);
  });
}
if (!process.env.DATABASE_URL) {
  console.error(
    "Falta DATABASE_URL. Conecta la base de datos PostgreSQL del proyecto en Replit. No se crea almacenamiento ficticio.",
  );
  process.exitCode = 1;
} else {
  run(["--filter", "@workspace/api-server", "run", "dev"], {
    PORT: "3001",
    NODE_ENV: "development",
    DVY_SERVE_STATIC: "false",
  });
  run(["--filter", "@workspace/mockup-sandbox", "run", "dev"], {
    PORT: process.env.PORT || "5000",
    BASE_PATH: "/",
    DVY_API_PORT: "3001",
  });
}
