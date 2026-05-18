import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { logger } from "./logger.ts";

dotenv.config();

interface KismetAlert {
  ALERT?: {
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// Create a test account or replace with real credentials.
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
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

export async function sendMail(json: KismetAlert, subject: string, body: string[]): Promise<void> {
  let alertTimestamp = new Date().toLocaleString();
  if (Object.keys(json).includes("ALERT") && json.ALERT) {
    logger.debug("Kismet alert received");
    const timestamp = (json.ALERT["kismet.alert.timestamp"] as number) || 0;
    alertTimestamp = new Date(timestamp * 1000).toLocaleString();
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
    const error = err as any;
    logger.error("Error sending mail", {
      subject,
      error: error.message,
      code: error.code,
      command: error.command,
    });
  }
}

export async function sendMailWithRetry(json: KismetAlert, subject: string, body: string[]): Promise<void> {
  for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      logger.debug(`Sending email (attempt ${attempt}/${RETRY_MAX_ATTEMPTS})`, { subject });

      let alertTimestamp = new Date().toLocaleString();
      if (Object.keys(json).includes("ALERT") && json.ALERT) {
        logger.debug("Kismet alert received");
        const timestamp = (json.ALERT["kismet.alert.timestamp"] as number) || 0;
        alertTimestamp = new Date(timestamp * 1000).toLocaleString();
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
      const error = err as any;
      logger.warn("Email send failed", {
        subject,
        attempt,
        error: error.message,
        code: error.code,
        command: error.command,
      });

      // If this was the last attempt, log error and give up
      if (attempt === RETRY_MAX_ATTEMPTS) {
        logger.error("Email send failed after all retries", {
          subject,
          maxAttempts: RETRY_MAX_ATTEMPTS,
          error: error.message,
          code: error.code,
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
