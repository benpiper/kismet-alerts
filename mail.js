import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { logger } from "./logger.js";

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
  logger: true
});

const RETRY_MAX_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 2000;
const RETRY_BACKOFF_MULTIPLIER = 3;

export async function sendMail(json, subject, body) {
  let alertTimestamp = new Date().toLocaleString();
  if (Object.keys(json).includes("ALERT")) {
    logger.debug("Kismet alert received");
    alertTimestamp = new Date(
      json["ALERT"]["kismet.alert.timestamp"] * 1000
    ).toLocaleString();
  }
  logger.debug("Alert timestamp", { timestamp: alertTimestamp });
  const bodyHTML = body.map((alert) => `<br>${alert}</br>`);
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_TO,
      subject: subject,
      text: `${alertTimestamp}  History: ${body}`, // plain‑text body
      html: `<p>${alertTimestamp}<p>History: ${bodyHTML}</p>`, // HTML body
    });

    logger.info("Message sent successfully", { subject, response: info.response });
  } catch (err) {
    logger.error("Error sending mail", {
      subject,
      error: err.message,
      code: err.code,
      command: err.command,
    });
  }
}

export async function sendMailWithRetry(json, subject, body) {
  for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      logger.debug(`Sending email (attempt ${attempt}/${RETRY_MAX_ATTEMPTS})`, { subject });

      let alertTimestamp = new Date().toLocaleString();
      if (Object.keys(json).includes("ALERT")) {
        logger.debug("Kismet alert received");
        alertTimestamp = new Date(
          json["ALERT"]["kismet.alert.timestamp"] * 1000
        ).toLocaleString();
      }

      const bodyHTML = body.map((alert) => `<br>${alert}</br>`);
      const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: process.env.EMAIL_TO,
        subject: subject,
        text: `${alertTimestamp}  History: ${body}`,
        html: `<p>${alertTimestamp}<p>History: ${bodyHTML}</p>`,
      });

      logger.info("Message sent successfully", {
        subject,
        attempt,
        response: info.response,
      });
      return; // Success, exit function
    } catch (err) {
      logger.warn("Email send failed", {
        subject,
        attempt,
        error: err.message,
        code: err.code,
        command: err.command,
      });

      // If this was the last attempt, log error and give up
      if (attempt === RETRY_MAX_ATTEMPTS) {
        logger.error("Email send failed after all retries", {
          subject,
          maxAttempts: RETRY_MAX_ATTEMPTS,
          error: err.message,
          code: err.code,
        });
        return; // Give up
      }

      // Calculate delay with exponential backoff
      const delayMs = RETRY_BASE_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt - 1);
      logger.info("Retrying email send", {
        subject,
        nextAttempt: attempt + 1,
        delayMs,
      });

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
