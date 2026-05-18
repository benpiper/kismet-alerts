import type { MacMessageMapping } from "./macmessagemappings.ts";

export const macMessageMappings: MacMessageMapping[] = [
  {
    mac: "00:00:00:00:00:00",
    message: "Suspicious device 1",
    // Uses global cooldown timers (5s found, 30s lost)
    // Alerts sent immediately; cooldown enforced before next alert of same type
  },
  {
    mac: "00:00:00:00:00:01",
    message: "Suspicious device 2",
    // Uses global cooldown timers (5s found, 30s lost)
    // Alerts sent immediately; cooldown enforced before next alert of same type
  },
  {
    mac: "00:00:00:00:00:02",
    message: "Unreliable device - longer cooldown",
    // Device has WiFi flakiness, needs longer cooldown between alerts
    foundTimerMs: 10000,  // Send immediately; cooldown 10s before next found alert
    lostTimerMs: 60000,   // Send immediately; cooldown 60s before next lost alert
  },
  {
    mac: "00:00:00:00:00:03",
    message: "Reliable device - shorter cooldown",
    // Device has stable connection, respond faster with more frequent alerts
    foundTimerMs: 1000,   // Send immediately; cooldown 1s before next found alert
    lostTimerMs: 15000,   // Send immediately; cooldown 15s before next lost alert
  },
  {
    mac: "00:00:00:00:00:04",
    message: "Device with asymmetric cooldowns",
    // Quick to detect found, slow to detect lost (don't spam clear emails)
    foundTimerMs: 2000,   // Send immediately; cooldown 2s before next found alert
    lostTimerMs: 120000,  // Send immediately; cooldown 2m before next lost alert
  },
];
