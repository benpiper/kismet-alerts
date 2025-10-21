//const nodemailer = require("nodemailer");
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

// Create a test account or replace with real credentials.
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false, // true for 465, false for other ports
  requireTLS: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    // do not fail on invalid certs
    rejectUnauthorized: false,
  },
});

// Wrap in an async IIFE so we can use await.
export async function sendMail(json, subject, body) {
  let alertTimestamp = new Date().toLocaleString();
  if (Object.keys(json).includes("ALERT")) {
    console.log("Kismet alert received");
    alertTimestamp = new Date(
      json["ALERT"]["kismet.alert.timestamp"] * 1000
    ).toLocaleString();
  }
  console.log("Alert timestamp:", alertTimestamp);
  const bodyHTML = body.map((alert) => `<br>${alert}</br>`);
  console.log(bodyHTML);
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_TO,
      subject: subject,
      text: `${alertTimestamp}  History: ${body}`, // plain‑text body
      html: `<p>${alertTimestamp}<p>History: ${bodyHTML}</p>`, // HTML body
    });

    console.log("Message sent:", info.response);
  } catch (err) {
    console.log("Error sending mail");
  }
}
