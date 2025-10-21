import { sendMail } from "./mail.js";
import { macMessageMappings } from "./macmessagemappings.js";

var alertHistory = [];

export async function processAlert(json) {
  console.log("Processing alert...");
  const alertString = json["ALERT"]["kismet.alert.text"].toString();
  const channel = json["ALERT"]["kismet.alert.channel"].toString();
  macMessageMappings.forEach(async (macMessageMapping) => {
    if (alertString.includes(macMessageMapping.mac)) {
      if (alertString.includes("hasn't been seen")) {
        await sendMail(
          json,
          `Clear: ${macMessageMapping.message}`,
          alertHistory
        );
      } else if (alertString.includes("has been found")) {
        console.log("Adding to alert history...");
        alertHistory.push(
          new Date(
            json["ALERT"]["kismet.alert.timestamp"] * 1000
          ).toLocaleString()
        );
        console.log(`Alert history: ${alertHistory}`);
        await sendMail(
          json,
          `Alert: ${macMessageMapping.message} on channel ${channel}`,
          alertHistory
        );
        // Optional: play a sound when alert triggered
        // await playAudioFile("./horn.mp3");
      }
    }
  });
}
