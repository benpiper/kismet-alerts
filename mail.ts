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

export interface MailAttachment {
  filename: string;
  content: Buffer;
  cid: string;
}

const RETRY_MAX_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 2000;
const RETRY_BACKOFF_MULTIPLIER = 3;

function buildHtmlBody(bodyHTML: string[], attachments: MailAttachment[]): string {
  let html = `<p>History: ${bodyHTML.join('')}</p>`;
  if (attachments.length > 0) {
    html += `<h3>NVR Snapshots</h3>`;
    html += `<div style="display: flex; flex-direction: column; gap: 15px;">`;
    for (const att of attachments) {
      html += `
        <div style="border: 1px solid #ddd; padding: 10px; border-radius: 5px; background-color: #f9f9f9; max-width: 600px;">
          <div style="font-weight: bold; margin-bottom: 5px;">${att.filename}</div>
          <img src="cid:${att.cid}" alt="${att.filename}" style="max-width: 100%; height: auto; display: block; border-radius: 3px;" />
        </div>`;
    }
    html += `</div>`;
  }
  return html;
}

export async function sendMail(
  json: KismetAlert,
  subject: string,
  body: string[],
  attachments: MailAttachment[] = []
): Promise<void> {
  let alertTimestamp = new Date().toLocaleString();
  if (Object.keys(json).includes("ALERT") && json.ALERT) {
    logger.debug("Kismet alert received");
    const timestamp = (json.ALERT["kismet.alert.timestamp"] as number) || 0;
    alertTimestamp = new Date(timestamp * 1000).toLocaleString();
  }
  logger.debug("Alert timestamp", { timestamp: alertTimestamp });
  const bodyHTML = body.map((alert) => `<br>${alert}</br>`);
  const htmlContent = `<p>${alertTimestamp}</p>` + buildHtmlBody(bodyHTML, attachments);

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_TO,
      subject: subject,
      text: `${alertTimestamp}  History: ${body}`, // plain‑text body
      html: htmlContent, // HTML body
      attachments: attachments.map(att => ({
        filename: att.filename,
        content: att.content,
        cid: att.cid,
      })),
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

export async function sendMailWithRetry(
  json: KismetAlert,
  subject: string,
  body: string[],
  attachments: MailAttachment[] = []
): Promise<void> {
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
      const htmlContent = `<p>${alertTimestamp}</p>` + buildHtmlBody(bodyHTML, attachments);

      const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: process.env.EMAIL_TO,
        subject: subject,
        text: `${alertTimestamp}  History: ${body}`,
        html: htmlContent,
        attachments: attachments.map(att => ({
          filename: att.filename,
          content: att.content,
          cid: att.cid,
        })),
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
