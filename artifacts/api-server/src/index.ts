import app from "./app";
import { logger } from "./lib/logger";
import { store } from "./dvy/store";
import { initializeAutomation, runJobs } from "./dvy/automation";
import { pool } from "@workspace/db";

const port = Number(process.env.PORT || "5000");
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be a valid port number");
try {
  await store.init();
  await initializeAutomation(store);
  const server = app.listen(port, "0.0.0.0", () =>
    logger.info({ port }, "DevuélveloYa ready"),
  );
  let job: Promise<void> | null = null;
  let stopping = false;
  const tick = () => {
    if (job || stopping) return;
    job = runJobs(store)
      .then(() => {})
      .catch((error: unknown) => {
        logger.error(
          { errorType: error instanceof Error ? error.name : "JobError" },
          "No se pudo completar la ejecución de tareas; se reintentará en el siguiente ciclo.",
        );
      })
      .finally(() => {
        job = null;
      });
  };
  const timer = setInterval(tick, 60_000);
  timer.unref();
  tick();
  const shutdown = () => {
    stopping = true;
    clearInterval(timer);
    server.close(() => {
      void Promise.resolve(job)
        .then(() => pool.end())
        .finally(() => process.exit(0));
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
} catch (error) {
  logger.error(
    { errorType: error instanceof Error ? error.name : "DatabaseError" },
    "No se pudo iniciar la base de datos. Revisa DATABASE_URL y sus permisos.",
  );
  await pool.end();
  process.exitCode = 1;
}
