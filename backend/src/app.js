import cors from "cors";
import express from "express";
import helmet from "helmet";
import hpp from "hpp";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { swaggerSpec } from "./config/swagger.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { departmentsRouter } from "./modules/departments/departments.routes.js";
import { rolesRouter } from "./modules/roles/roles.routes.js";
import { masterDataRouter } from "./modules/master-data/master-data.routes.js";
import { adminUsersRouter } from "./modules/admin-users/admin-users.routes.js";
import { documentsRouter } from "./modules/documents/documents.routes.js";
import { analyticsRouter } from "./modules/analytics/analytics.routes.js";
import { reportsRouter } from "./modules/reports/reports.routes.js";
import { chatRouter } from "./modules/chat/chat.routes.js";
import { retrievalRouter } from "./modules/retrieval/retrieval.routes.js";
import { agentConfigRouter } from "./modules/agent-config/agent-config.routes.js";
import { emailRouter } from "./modules/email/email.routes.js";
import { sharepointRouter } from "./modules/sharepoint/sharepoint.routes.js";
import { auditRouter } from "./modules/audit/audit.routes.js";
import { manualReportsRouter } from "./modules/manual-reports/manual-reports.routes.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { errorHandler } from "./middleware/error-handler.js";

const app = express();

const corsOrigins = ["http://localhost:4000", "http://localhost:5173", "https://budget-ai-assistant.vercel.app", "https://budget-ai-assistant.vercel.app/"]
app.use(helmet());
app.use(hpp());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (corsOrigins.includes(origin)) {
        if (corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("Not allowed by CORS"));
      },
      credentials: true
    })
);
app.use(express.json({ limit: "10mb" }));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(globalLimiter);
app.use("/api/v1/auth", authLimiter, authRouter);
app.use("/api/v1/health", healthRouter);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/admin/users", adminUsersRouter);
app.use("/api/v1/departments", departmentsRouter);
app.use("/api/v1/roles", rolesRouter);
app.use("/api/v1/master-data", masterDataRouter);
app.use("/api/v1/documents", documentsRouter);
app.use("/api/v1/analytics", analyticsRouter);
app.use("/api/v1/reports", reportsRouter);
app.use("/api/v1/chat", chatRouter);
app.use("/api/v1/retrieval", retrievalRouter);
app.use("/api/v1/agent-configs", agentConfigRouter);
app.use("/api/v1/email", emailRouter);
app.use("/api/v1/sharepoint", sharepointRouter);
app.use("/api/v1/audit", auditRouter);
app.use("/api/v1/manual-reports", manualReportsRouter);

app.use("/api/v1/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/api/v1/docs.json", (_req, res) => res.json(swaggerSpec));

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
