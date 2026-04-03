import dotenv from "dotenv";

dotenv.config();

const required = ["DATABASE_URL", "JWT_SECRET"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  useOpenAiEmbeddings: String(process.env.USE_OPENAI_EMBEDDINGS || "false").toLowerCase() === "true",
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  openAiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
  openAiChatModel: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
  embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS || 1536),
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:5174/,http://localhost:5173,https://budget-ai-assistant.vercel.app/,https://budgetaiassistance.myaisquad.com")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  awsAccessKey: process.env.AWS_ACCESS_KEY || "",
  awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  awsBucket: process.env.AWS_BUCKET || "",
  awsRegion: process.env.AWS_REGION || "us-east-1",
  frontendUrl: process.env.FRONTEND_URL || "https://budgetaiassistance.myaisquad.com/"
};
