import { sendMailWithRetry } from "./mail.ts";
import { macMessageMappings, type MacMessageMapping } from "./macmessagemappings.ts";
import { logger } from "./logger.ts";

const MAX_ALERT_HISTORY_SIZE = 100;
const MAX_ALERT_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEVICE_FOUND_TIMER_MS = 5000;     // 5 seconds before sending "found" alert
const DEVICE_LOST_TIMER_MS = 30000;    // 30 seconds before sending "lost" alert

interface AlertHistoryEntry {
  timestampMs: number;
  timestamp: string;
  mac: string;
  message: string;
  channel: string;
}

interface DeviceState {
  mac: string;
  message: string;
  isFound: boolean;
  foundTimerId?: NodeJS.Timeout;
  lostTimerId?: NodeJS.Timeout;
  lastChannel?: string;
}

interface KismetAlert {
  ALERT?: {
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

let alertHistory: AlertHistoryEntry[] = [];
const deviceStates = new Map<string, DeviceState>();

function trimAlertHistory(): void {
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

function getOrCreateDeviceState(
  mac: string,
  message: string
): DeviceState {
  if (!deviceStates.has(mac)) {
    deviceStates.set(mac, {
      mac,
      message,
      isFound: false,
    });
  }
  return deviceStates.get(mac)!;
}

function getFoundTimer(mapping: MacMessageMapping): number {
  return mapping.foundTimerMs ?? DEVICE_FOUND_TIMER_MS;
}

function getLostTimer(mapping: MacMessageMapping): number {
  return mapping.lostTimerMs ?? DEVICE_LOST_TIMER_MS;
}

async function sendFoundAlert(state: DeviceState, channel: string): Promise<void> {
  const timestampMs = Date.now();

  alertHistory.push({
    timestampMs,
    timestamp: new Date(timestampMs).toLocaleString(),
    mac: state.mac,
    message: state.message,
    channel,
  });

  trimAlertHistory();

  logger.info("Sending device found alert", {
    mac: state.mac,
    message: state.message,
    channel,
  });

  await sendMailWithRetry(
    {},
    `Alert: ${state.message} on channel ${channel}`,
    formatAlertHistory()
  );
}

async function sendLostAlert(state: DeviceState): Promise<void> {
  logger.info("Sending device lost alert", {
    mac: state.mac,
    message: state.message,
  });

  await sendMailWithRetry(
    {},
    `Clear: ${state.message}`,
    formatAlertHistory()
  );
}

export async function processAlert(json: KismetAlert): Promise<void> {
  try {
    logger.info("Processing alert");

    // Validate JSON structure
    if (!json || !json.ALERT) {
      logger.error("Invalid alert JSON structure: missing ALERT property");
      return;
    }

    const alertText = json.ALERT["kismet.alert.text"];
    const alertChannel = json.ALERT["kismet.alert.channel"];

    if (!alertText) {
      logger.error("Invalid alert: missing kismet.alert.text");
      return;
    }

    const alertString = alertText.toString();
    const channel = alertChannel?.toString() ?? "unknown";

    // Use for...of instead of forEach to avoid async race condition
    for (const macMessageMapping of macMessageMappings) {
      if (!alertString.includes(macMessageMapping.mac)) {
        continue;
      }

      const state = getOrCreateDeviceState(
        macMessageMapping.mac,
        macMessageMapping.message
      );

      const foundTimerMs = getFoundTimer(macMessageMapping);
      const lostTimerMs = getLostTimer(macMessageMapping);

      if (alertString.includes("hasn't been seen")) {
        // Device lost
        logger.debug("Device lost detected", {
          mac: state.mac,
          message: state.message,
        });

        // Cancel found timer if active
        if (state.foundTimerId) {
          clearTimeout(state.foundTimerId);
          state.foundTimerId = undefined;
          logger.debug("Cancelled pending found alert", { mac: state.mac });
        }

        state.isFound = false;

        // Start lost timer if not already pending
        if (!state.lostTimerId) {
          state.lostTimerId = setTimeout(async () => {
            state.lostTimerId = undefined;
            await sendLostAlert(state);
          }, lostTimerMs);

          logger.debug("Started lost timer", {
            mac: state.mac,
            delayMs: lostTimerMs,
          });
        }
      } else if (alertString.includes("has been found")) {
        // Device found
        logger.debug("Device found detected", {
          mac: state.mac,
          message: state.message,
          channel,
        });

        // Cancel lost timer if active
        if (state.lostTimerId) {
          clearTimeout(state.lostTimerId);
          state.lostTimerId = undefined;
          logger.debug("Cancelled pending lost alert", { mac: state.mac });
        }

        state.isFound = true;
        state.lastChannel = channel;

        // Start found timer if not already pending
        if (!state.foundTimerId) {
          state.foundTimerId = setTimeout(async () => {
            state.foundTimerId = undefined;
            await sendFoundAlert(state, channel);
          }, foundTimerMs);

          logger.debug("Started found timer", {
            mac: state.mac,
            delayMs: foundTimerMs,
          });
        }
      }
    }
  } catch (err) {
    const error = err as Error;
    logger.error("Error processing alert", {
      error: error.message,
      stack: error.stack,
    });
  }
}

function formatAlertHistory(): string[] {
  return alertHistory.map((entry) => `${entry.timestamp} - ${entry.message} (CH:${entry.channel})`);
}
