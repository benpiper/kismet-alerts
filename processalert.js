import { sendMailWithRetry } from "./mail.js";
import { macMessageMappings } from "./macmessagemappings.js";
import { logger } from "./logger.js";

const MAX_ALERT_HISTORY_SIZE = 100;
const MAX_ALERT_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

var alertHistory = [];

function trimAlertHistory() {
  const now = Date.now();

  // Remove entries older than 24 hours
  alertHistory = alertHistory.filter((entry) => {
    return (now - entry.timestampMs) < MAX_ALERT_AGE_MS;
  });

  // If still over max size, remove oldest entries (FIFO)
  if (alertHistory.length > MAX_ALERT_HISTORY_SIZE) {
    alertHistory = alertHistory.slice(-MAX_ALERT_HISTORY_SIZE);
  }

  logger.debug("Alert history trimmed", {
    size: alertHistory.length,
    maxSize: MAX_ALERT_HISTORY_SIZE,
  });
}

export async function processAlert(json) {
  try {
    logger.info("Processing alert");

    // Validate JSON structure
    if (!json || !json.ALERT) {
      logger.error("Invalid alert JSON structure: missing ALERT property");
      return;
    }

    const alertText = json.ALERT["kismet.alert.text"];
    const alertChannel = json.ALERT["kismet.alert.channel"];
    const alertTimestamp = json.ALERT["kismet.alert.timestamp"];

    if (!alertText) {
      logger.error("Invalid alert: missing kismet.alert.text");
      return;
    }

    const alertString = alertText.toString();
    const channel = alertChannel?.toString() ?? "unknown";

    // Use for...of instead of forEach to avoid async race condition
    for (const macMessageMapping of macMessageMappings) {
      if (alertString.includes(macMessageMapping.mac)) {
        if (alertString.includes("hasn't been seen")) {
          logger.info("Processing device offline alert", {
            mac: macMessageMapping.mac,
            message: macMessageMapping.message,
          });
          await sendMailWithRetry(
            json,
            `Clear: ${macMessageMapping.message}`,
            formatAlertHistory()
          );
        } else if (alertString.includes("has been found")) {
          logger.info("Processing device found alert", {
            mac: macMessageMapping.mac,
            message: macMessageMapping.message,
            channel,
          });

          // Create alert history entry
          const timestampMs = alertTimestamp
            ? parseInt(alertTimestamp) * 1000
            : Date.now();

          alertHistory.push({
            timestampMs,
            timestamp: new Date(timestampMs).toLocaleString(),
            mac: macMessageMapping.mac,
            message: macMessageMapping.message,
            channel,
          });

          trimAlertHistory();

          logger.debug("Added to alert history", {
            size: alertHistory.length,
            entry: alertHistory[alertHistory.length - 1],
          });

          await sendMailWithRetry(
            json,
            `Alert: ${macMessageMapping.message} on channel ${channel}`,
            formatAlertHistory()
          );
        }
      }
    }
  } catch (err) {
    logger.error("Error processing alert", {
      error: err.message,
      stack: err.stack,
    });
  }
}

function formatAlertHistory() {
  return alertHistory.map((entry) => `${entry.timestamp} - ${entry.message} (CH:${entry.channel})`);
}
