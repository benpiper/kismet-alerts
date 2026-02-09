# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Kismet WiFi security monitoring alert system. It subscribes to Kismet alerts via WebSocket connection and sends email notifications when specific MAC addresses are detected. The system is configured via environment variables and a MAC-to-message mapping file.

**Key Dependencies:**
- `ws` - WebSocket client for Kismet alerts
- `nodemailer` - Email delivery
- `dotenv` - Environment variable configuration
- `moment` - Date/time utilities
- `nodemon` - Development auto-reload (used in npm start)
- `audic` - Audio playback capability (optional, currently commented out)

## Architecture

The application follows a simple event-driven architecture:

1. **kismetalerts.js** - Entry point. Establishes WebSocket connection to Kismet server and subscribes to ALERT events. Sends startup/shutdown notification emails. On message receipt, parses JSON and delegates to processAlert().

2. **processalert.js** - Alert processing logic. Maintains a local alertHistory array (in-memory). Compares incoming alert strings against configured MAC addresses in macmessagemappings. Distinguishes between two alert types:
   - "has been found" - Device detected (pushes to alertHistory, sends alert email)
   - "hasn't been seen" - Device lost/offline (sends clear email, clears alert context)

3. **mail.js** - Email abstraction layer. Uses nodemailer to send SMTP emails. Extracts Kismet timestamp from JSON alerts (if present) or uses current time. Formats email body with alert history as HTML list. Handles SMTP connection via environment variables.

4. **macmessagemappings.js** - User configuration file (not in git). Exports array of {mac, message} objects mapping MAC addresses to human-readable descriptions. See example_macmessagemappings.js for format.

## Configuration

Required environment variables in `.env`:
- `KISMET_HOST`, `KISMET_PORT`, `KISMET_USERNAME`, `KISMET_PASSWORD` - Kismet server connection
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS` - SMTP server credentials
- `EMAIL_FROM`, `EMAIL_TO` - Email address strings for From/To fields

Create `macmessagemappings.js` by copying and customizing example_macmessagemappings.js. This file maps specific MAC addresses to friendly device names that appear in email subjects.

**Note:** `.env` contains plaintext credentials and is git-ignored. macmessagemappings.js is not tracked and must be created by users.

## Running the Application

```bash
npm install                 # Install dependencies
npm start                   # Run with nodemon (auto-reload on file changes)
```

The application runs continuously, listening for WebSocket messages. Exit with Ctrl+C.

## Development Notes

**Alert History:** The alertHistory array in processalert.js is in-memory and will be lost on application restart. This is intentional for simplicity but could be enhanced with persistent storage if needed.

**Email Formatting:** The sendMail() function receives alertHistory as an array and converts it to HTML for the email body. Plain text email also includes the history.

**Security:** The mail.js configuration sets `rejectUnauthorized: false` for TLS, allowing self-signed certificates. This is by design but may need adjustment for production use with proper certificates.

**WebSocket Messages:** The application sends a JSON subscription message `{SUBSCRIBE: "ALERT"}` to Kismet after connecting. Alert JSON structure is expected to have:
- `ALERT.kismet.alert.text` - Alert description string (contains MAC and status keywords)
- `ALERT.kismet.alert.channel` - WiFi channel number
- `ALERT.kismet.alert.timestamp` - Unix timestamp (multiplied by 1000 for JavaScript Date)

**Optional Feature:** Line 32 in processalert.js has commented code to play an audio file on alert. Uses the audic package which is installed but not currently active.
