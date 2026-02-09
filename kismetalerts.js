import { sendMailWithRetry } from "./mail.js";
import { processAlert } from "./processalert.js";
import { validateConfig } from "./config.js";
import { logger } from "./logger.js";
import { createWebSocketConnection } from "./websocket-manager.js";
import dotenv from "dotenv";

dotenv.config();

// Validate configuration at startup
let config;
try {
  config = validateConfig();
  logger.info("Configuration validated successfully");
} catch (err) {
  logger.error("Configuration validation failed", { error: err.message });
  process.exit(1);
}

const wsUrl = `ws://${config.kismet.host}:${config.kismet.port}/eventbus/events.ws?user=${config.kismet.username}&password=${config.kismet.password}`;

let wsManager;
let isShuttingDown = false;

function handleMessage(msg) {
  try {
    logger.debug("WebSocket message received");
    const json = JSON.parse(msg.data);
    processAlert(json);
  } catch (err) {
    logger.error("Error parsing WebSocket message", {
      error: err.message,
      data: msg.data?.substring(0, 100), // Log first 100 chars of data
    });
  }
}

function handleReady(ws) {
  logger.info("WebSocket connection ready, subscribing to ALERT events");
  const req = { SUBSCRIBE: "ALERT" };
  ws.send(JSON.stringify(req));
  sendMailWithRetry({}, "Starting up", []);
}

async function gracefulShutdown() {
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
    logger.error("Error during shutdown", { error: err.message });
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

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled promise rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
    promise: String(promise),
  });
  gracefulShutdown();
});

// WebSocket fatal error handler
process.on("websocket-fatal-error", async (err) => {
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
    logger.error("Failed to send error notification email", {
      error: mailErr.message,
    });
  }
  process.exit(1);
});

// Create WebSocket connection with manager
logger.info("Creating WebSocket connection to Kismet", { host: config.kismet.host });
wsManager = createWebSocketConnection(wsUrl, handleMessage, handleReady);
