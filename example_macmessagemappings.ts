import type { MacMessageMapping } from "./macmessagemappings.ts";

export const macMessageMappings: MacMessageMapping[] = [
  {
    mac: "00:00:00:00:00:00",
    message: "Suspicious device 1",
    // Uses global timers (5s found, 30s lost)
  },
  {
    mac: "00:00:00:00:00:01",
    message: "Suspicious device 2",
    // Uses global timers (5s found, 30s lost)
  },
  {
    mac: "00:00:00:00:00:02",
    message: "Unreliable device - longer timer",
    // Device has WiFi flakiness, needs longer debounce
    foundTimerMs: 10000,  // 10 seconds before alerting
    lostTimerMs: 60000,   // 60 seconds before sending clear
  },
  {
    mac: "00:00:00:00:00:03",
    message: "Reliable device - shorter timer",
    // Device has stable connection, respond faster
    foundTimerMs: 1000,   // 1 second before alerting
    lostTimerMs: 15000,   // 15 seconds before sending clear
  },
  {
    mac: "00:00:00:00:00:04",
    message: "Device with asymmetric timers",
    // Quick to detect found, slow to detect lost (don't spam clears)
    foundTimerMs: 2000,   // 2 seconds before alerting
    lostTimerMs: 120000,  // 2 minutes before sending clear
  },
];
