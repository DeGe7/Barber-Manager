import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./routes/seed";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Seed on startup — safe to call even if tables already have data
seedIfEmpty().catch((err) => {
  logger.error({ err }, "Seed error (non-fatal)");
});

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
