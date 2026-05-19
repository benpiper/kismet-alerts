import { sendMailWithRetry } from "./mail.ts";
import { macMessageMappings, type MacMessageMapping } from "./macmessagemappings.ts";
import { logger } from "./logger.ts";
import { getNvrSnapshots } from "./nvr.ts";

const MAX_ALERT_HISTORY_SIZE = 100;
const MAX_ALERT_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEVICE_FOUND_COOLDOWN_MS = 30 * 60 * 1000;     // 30 mins between consecutive found alerts
const DEVICE_LOST_COOLDOWN_MS = 30 * 60 * 1000;    // 30 mins between consecutive lost alerts
const STATUS_REPORT_INTERVAL_MS = 5 * 60 * 1000 ; // Log device status every 5 mins

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
  lastChannel?: string;
  lastFoundEmailTimeMs: number;
  lastLostEmailTimeMs: number;
}

interface KismetAlert {
  ALERT?: {
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

let alertHistory: AlertHistoryEntry[] = [];
const deviceStates = new Map<string, DeviceState>();
let timerStatusInterval: NodeJS.Timeout | undefined;

function logDeviceStatus(): void {
  const deviceStatus = Array.from(deviceStates.values()).map((state) => ({
    mac: state.mac,
    message: state.message,
    isFound: state.isFound,
    lastFoundEmailTime: state.lastFoundEmailTimeMs > 0 ? new Date(state.lastFoundEmailTimeMs).toISOString() : "never",
    lastLostEmailTime: state.lastLostEmailTimeMs > 0 ? new Date(state.lastLostEmailTimeMs).toISOString() : "never",
    lastChannel: state.lastChannel ?? "unknown",
  }));

  logger.info("Device status summary", {
    totalDevices: deviceStates.size,
    devices: deviceStatus,
  });
}

export function startDeviceStatusReporting(): void {
  if (timerStatusInterval) return;

  timerStatusInterval = setInterval(() => {
    logDeviceStatus();
  }, STATUS_REPORT_INTERVAL_MS);

  logger.info("Started device status reporting", {
    intervalMs: STATUS_REPORT_INTERVAL_MS,
  });
}

export function stopDeviceStatusReporting(): void {
  if (timerStatusInterval) {
    clearInterval(timerStatusInterval);
    timerStatusInterval = undefined;
    logger.info("Stopped device status reporting");
  }
}

export function logCurrentDeviceStatus(): void {
  logDeviceStatus();
}

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
      lastFoundEmailTimeMs: 0,
      lastLostEmailTimeMs: 0,
    });
  }
  return deviceStates.get(mac)!;
}

function getFoundCooldown(mapping: MacMessageMapping): number {
  return mapping.foundTimerMs ?? DEVICE_FOUND_COOLDOWN_MS;
}

function getLostCooldown(mapping: MacMessageMapping): number {
  return mapping.lostTimerMs ?? DEVICE_LOST_COOLDOWN_MS;
}

async function sendFoundAlert(
  state: DeviceState,
  channel: string,
  triggerNvr: boolean,
  nvrChannels?: number[]
): Promise<void> {
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

  let snapshots: any[] = [];
  if (triggerNvr || (nvrChannels && nvrChannels.length > 0)) {
    try {
      snapshots = await getNvrSnapshots(nvrChannels);
    } catch (err: any) {
      logger.error("Error retrieving NVR snapshots for found alert email", {
        error: err.message,
      });
    }
  }

  await sendMailWithRetry(
    {},
    `Alert: ${state.message} on channel ${channel}`,
    formatAlertHistory(),
    snapshots
  );

  state.lastFoundEmailTimeMs = timestampMs;
}

async function sendLostAlert(state: DeviceState): Promise<void> {
  const timestampMs = Date.now();

  logger.info("Sending device lost alert", {
    mac: state.mac,
    message: state.message,
  });

  await sendMailWithRetry(
    {},
    `Clear: ${state.message}`,
    formatAlertHistory()
  );

  state.lastLostEmailTimeMs = timestampMs;
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

      const foundCooldownMs = getFoundCooldown(macMessageMapping);
      const lostCooldownMs = getLostCooldown(macMessageMapping);

      if (alertString.includes("hasn't been seen")) {
        // Device lost
        logger.debug("Device lost detected", {
          mac: state.mac,
          message: state.message,
        });

        state.isFound = false;

        // Check if cooldown has elapsed since last lost email
        const timeSinceLastLostEmail = Date.now() - state.lastLostEmailTimeMs;
        const canSendLostAlert = timeSinceLastLostEmail >= lostCooldownMs;

        if (canSendLostAlert) {
          await sendLostAlert(state);

          logger.info("Sent lost alert", {
            mac: state.mac,
            message: state.message,
          });
        } else {
          logger.debug("Lost alert on cooldown", {
            mac: state.mac,
            message: state.message,
            timeSinceLastEmail: timeSinceLastLostEmail,
            cooldownPeriod: lostCooldownMs,
            willBeEligibleAt: new Date(
              state.lastLostEmailTimeMs + lostCooldownMs
            ).toISOString(),
          });
        }
      } else if (alertString.includes("has been found")) {
        // Device found
        logger.debug("Device found detected", {
          mac: state.mac,
          message: state.message,
          channel,
        });

        state.isFound = true;
        state.lastChannel = channel;

        // Check if cooldown has elapsed since last found email
        const timeSinceLastFoundEmail = Date.now() - state.lastFoundEmailTimeMs;
        const canSendFoundAlert = timeSinceLastFoundEmail >= foundCooldownMs;

        if (canSendFoundAlert) {
          await sendFoundAlert(
            state,
            channel,
            !!macMessageMapping.triggerNvr,
            macMessageMapping.nvrChannels
          );

          logger.info("Sent found alert", {
            mac: state.mac,
            message: state.message,
            channel,
          });
        } else {
          logger.debug("Found alert on cooldown", {
            mac: state.mac,
            message: state.message,
            channel,
            timeSinceLastEmail: timeSinceLastFoundEmail,
            cooldownPeriod: foundCooldownMs,
            willBeEligibleAt: new Date(
              state.lastFoundEmailTimeMs + foundCooldownMs
            ).toISOString(),
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
