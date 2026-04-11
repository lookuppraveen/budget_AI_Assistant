import { app } from "./app.js";
import { pool, testDbConnection } from "./config/db.js";
import { env } from "./config/env.js";
import { startRetrievalScheduler } from "./modules/retrieval/retrieval.service.js";
import { startReportScheduler } from "./modules/reports/reports.service.js";
import { startEmailResponderScheduler, stopEmailResponderScheduler } from "./modules/email/email-responder.service.js";
import { startScheduler, stopScheduler } from "./modules/scheduler/scheduler.service.js";

async function startServer() {
  await testDbConnection();
  startRetrievalScheduler();
  await startReportScheduler();
  await startScheduler();
  if (env.emailResponderEnabled) {
    startEmailResponderScheduler(env.emailResponderIntervalMs);
  }

  const server = app.listen(env.port, () => {
    console.log(`API running on http://localhost:${env.port}`);
  });

  const shutdown = async () => {
    stopEmailResponderScheduler();
    stopScheduler();
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer().catch((error) => {
  console.error("Server startup failed", error);
  process.exit(1);
});
