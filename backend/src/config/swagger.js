import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Budget AI Assistant API",
      version: "1.0.0",
      description: "REST API for the Budget AI Assistant — knowledge ingestion, chat, documents, reports, and admin."
    },
    servers: [{ url: "/api/v1", description: "API v1" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT"
        }
      }
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: "Auth", description: "Authentication and password reset" },
      { name: "Users", description: "User profile management" },
      { name: "Admin", description: "Admin user management" },
      { name: "Documents", description: "Knowledge document CRUD, upload, and review" },
      { name: "Reports", description: "Report generation, scheduling, and export" },
      { name: "Chat", description: "AI chat sessions and messages" },
      { name: "Retrieval", description: "Vector search, reindex, and scheduler" },
      { name: "Analytics", description: "Dashboard analytics" },
      { name: "Audit", description: "Audit log and metrics" },
      { name: "Email", description: "Email integration" },
      { name: "SharePoint", description: "SharePoint sync" },
      { name: "Departments", description: "Department management" },
      { name: "Roles", description: "Role management" },
      { name: "Health", description: "Health check" }
    ]
  },
  apis: ["./src/modules/**/*.routes.js"]
};

export const swaggerSpec = swaggerJsdoc(options);
