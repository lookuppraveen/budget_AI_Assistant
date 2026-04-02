import { app } from "./app.js";
import { pool, testDbConnection } from "./config/db.js";
import { env } from "./config/env.js";
import { startRetrievalScheduler } from "./modules/retrieval/retrieval.service.js";
import { startReportScheduler } from "./modules/reports/reports.service.js";

async function startServer() {
  await testDbConnection();
  startRetrievalScheduler();
  await startReportScheduler();

  const server = app.listen(env.port, () => {
    console.log(`API running on http://localhost:${env.port}`);
  });

  const shutdown = async () => {
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
