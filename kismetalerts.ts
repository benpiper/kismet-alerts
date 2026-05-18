import { sendMailWithRetry } from "./mail.ts";
import { processAlert, startTimerStatusReporting, stopTimerStatusReporting } from "./processalert.ts";
import { validateConfig, type AppConfig } from "./config.ts";
import { logger } from "./logger.ts";
import { createWebSocketConnection } from "./websocket-manager.ts";
import dotenv from "dotenv";
import WebSocket from "ws";

dotenv.config();

// Validate configuration at startup
let config: AppConfig;
try {
  config = validateConfig();
  logger.info("Configuration validated successfully");
} catch (err) {
  const error = err as Error;
  logger.error("Configuration validation failed", { error: error.message });
  process.exit(1);
}

const wsUrl = `ws://${config.kismet.host}:${config.kismet.port}/eventbus/events.ws?user=${config.kismet.username}&password=${config.kismet.password}`;

let wsManager: ReturnType<typeof createWebSocketConnection>;
let isShuttingDown = false;

function handleMessage(msg: WebSocket.MessageEvent): void {
  try {
    logger.debug("WebSocket message received");
    const json = JSON.parse(msg.data as string);
    processAlert(json);
  } catch (err) {
    const error = err as Error;
    logger.error("Error parsing WebSocket message", {
      error: error.message,
      data: (msg.data as string)?.substring(0, 100), // Log first 100 chars of data
    });
  }
}

function handleReady(ws: WebSocket): void {
  logger.info("WebSocket connection ready, subscribing to ALERT events");
  const req = { SUBSCRIBE: "ALERT" };
  ws.send(JSON.stringify(req));
  startTimerStatusReporting();
  sendMailWithRetry({}, "Starting up", []);
}

async function gracefulShutdown(): Promise<void> {
  if (isShuttingDown) {
    logger.warn("Shutdown already in progress");
    return;
  }

  isShuttingDown = true;
  logger.info("Graceful shutdown initiated");

  // Set a timeout to force exit if cleanup hangs
  const forceExitTimeout = setTimeout(() => {
    logger.error("Shutdown timeout reached, forcing exit");
    process.exit(1);
  }, 5000);

  try {
    // Stop timer status reporting
    stopTimerStatusReporting();

    // Close WebSocket connection
    if (wsManager) {
      wsManager.close();
      logger.info("WebSocket connection closed");
    }

    // Send shutdown notification email
    await sendMailWithRetry({}, "Shutting down", []);
    logger.info("Shutdown email sent");

    clearTimeout(forceExitTimeout);
    process.exit(0);
  } catch (err) {
    const error = err as Error;
    logger.error("Error during shutdown", { error: error.message });
    clearTimeout(forceExitTimeout);
    process.exit(1);
  }
}

// Graceful shutdown handlers
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// Unhandled error handlers
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", {
    error: err.message,
    stack: err.stack,
  });
  gracefulShutdown();
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
  gracefulShutdown();
});

// WebSocket fatal error handler
process.on("websocket-fatal-error" as unknown as any, async (err: Error) => {
  logger.error("WebSocket fatal error - giving up", {
    error: err.message,
  });
  try {
    await sendMailWithRetry(
      {},
      "Alert System Error: WebSocket connection failed",
      ["WebSocket reconnection attempts exhausted. System shutting down."]
    );
  } catch (mailErr) {
    const error = mailErr as Error;
    logger.error("Failed to send error notification email", {
      error: error.message,
    });
  }
  process.exit(1);
});

// Create WebSocket connection with manager
logger.info("Creating WebSocket connection to Kismet", { host: config.kismet.host });
wsManager = createWebSocketConnection(wsUrl, handleMessage, handleReady);
