import { store } from "./store";
import { initializeAutomation, runJobs } from "./automation";
import { pool } from "@workspace/db";
try {
  await store.init();
  await initializeAutomation(store);
  const result = await runJobs(store);
  console.log(JSON.stringify({ status: "completed", result }));
} catch (error) {
  console.error(
    "No se pudieron completar las tareas de DevuélveloYa.",
    error instanceof Error ? error.name : "JobError",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
