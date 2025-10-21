//import { playAudioFile } from "audic";
import { sendMail } from "./mail.js";
import { processAlert } from "./processalert.js";
import dotenv from "dotenv";
dotenv.config();

var wsAlert = new WebSocket(
  `ws://${process.env.KISMET_HOST}:${process.env.KISMET_PORT}/eventbus/events.ws?user=${process.env.KISMET_USERNAME}&password=${process.env.KISMET_PASSWORD}`
);

wsAlert.onmessage = function (msg) {
  console.log("message received");
  var json = JSON.parse(msg.data);
  console.log(json);
  processAlert(json);
};
wsAlert.onopen = function (event) {
  console.log("Opening websocket connection");
  var req = {
    SUBSCRIBE: "ALERT",
  };
  console.log(req);
  wsAlert.send(JSON.stringify(req));
  sendMail({}, "Starting up", []);
};

wsAlert.onclose = function (event) {
  console.log("connection closed");
  sendMail({}, "Shutting down", []);
};
