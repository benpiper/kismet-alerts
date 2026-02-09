# Reliability Improvements - Quick Start Guide

## What Changed?

The Kismet alerts system now has **production-grade reliability**:

### New Files (3)
1. **logger.js** - Structured logging with timestamps
2. **config.js** - Configuration validation at startup
3. **websocket-manager.js** - Auto-reconnecting WebSocket

### Updated Files (3)
4. **kismetalerts.js** - Config validation, error handlers, graceful shutdown
5. **processalert.js** - Fixed race condition, history limits, retry logic
6. **mail.js** - Email retry logic with exponential backoff

---

## How to Use

### Basic Setup
```bash
# Copy and customize environment
cp .env.example .env
# Edit .env with your Kismet and email credentials

# Copy and customize MAC mappings
cp example_macmessagemappings.js macmessagemappings.js
# Edit macmessagemappings.js with your devices

# Install dependencies (if not done)
npm install

# Run with auto-reload
npm start
```

### With Debug Logging
```bash
# Enable DEBUG level logging to see all operations
LOG_LEVEL=DEBUG npm start
```

### Graceful Shutdown
```bash
# While running, press Ctrl+C
# Application will:
# - Close WebSocket connection
# - Send shutdown notification email
# - Exit cleanly within 5 seconds
```

---

## Key Features

### 1. Configuration Validation ✓
**What it does:** Validates all 10 required environment variables at startup

**Error example:**
```
Error: Configuration validation failed:
  - Missing required environment variable: KISMET_HOST
  - Invalid port number for KISMET_PORT: 999999 (must be 1-65535)
  - Invalid email format for EMAIL_FROM: notanemail (must contain @)
```

**Prevents:** Silent failures from missing configuration

---

### 2. Structured Logging ✓
**What it does:** Timestamps and context for all operations

**Output example:**
```
[2026-02-09T15:54:26.123Z] INFO: WebSocket connection established
[2026-02-09T15:54:27.456Z] INFO: Processing device found alert {channel: "6", mac: "AA:BB:CC:DD:EE:FF"}
[2026-02-09T15:54:28.789Z] INFO: Message sent successfully {subject: "Alert: WiFi Scanner"}
```

**Control verbosity:**
- `LOG_LEVEL=DEBUG` - All details (verbose)
- `LOG_LEVEL=INFO` - Standard operations (default)
- `LOG_LEVEL=WARN` - Problems only
- `LOG_LEVEL=ERROR` - Errors only

---

### 3. Auto-Reconnecting WebSocket ✓
**What it does:** Automatically reconnects if Kismet server restarts

**Reconnection timeline:**
```
Attempt 1: Wait 1s, retry
Attempt 2: Wait 2s, retry
Attempt 3: Wait 4s, retry
Attempt 4: Wait 8s, retry
Attempt 5: Wait 16s, retry
Attempt 6: Wait 32s, retry
Attempt 7+: Wait ~60s, retry
Attempt 10: Give up, send error email, exit
```

**Jitter:** Each delay has ±20% randomization (prevents thundering herd)

**Benefits:** Monitoring continues when Kismet restarts

---

### 4. Email Retry Logic ✓
**What it does:** Retries failed emails automatically

**Retry schedule:**
```
Attempt 1: Send
    Fail? Wait 2s
Attempt 2: Send
    Fail? Wait 6s
Attempt 3: Send
    Fail? Wait 18s
Attempt 4: Send
    Fail? Give up, log error
```

**Benefits:** Survives brief SMTP outages (≤26 seconds)

---

### 5. Alert History Management ✓
**What it does:** Prevents memory leaks from unbounded history

**Limits:**
- Maximum 100 alert entries
- Maximum 24 hours age
- Oldest entries removed automatically

**Benefits:** Stable memory usage over long running periods

---

### 6. Graceful Shutdown ✓
**What it does:** Clean exit on Ctrl+C or system signals

**Process:**
1. Closes WebSocket connection
2. Sends shutdown notification email
3. Exits within 5-second timeout
4. No hanging processes

**Prevents:** Zombie processes, lost data

---

### 7. Error Handlers ✓
**What it does:** Catches unexpected errors and logs them

**Catches:**
- Malformed JSON messages
- Uncaught exceptions
- Unhandled promise rejections
- WebSocket connection errors

**Prevents:** Silent crashes

---

## Common Issues & Solutions

### Issue: "Configuration validation failed: Missing required environment variable"
**Solution:** Check your `.env` file has all 10 required variables:
```bash
KISMET_HOST, KISMET_PORT, KISMET_USERNAME, KISMET_PASSWORD,
EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM, EMAIL_TO
```

### Issue: "Invalid port number"
**Solution:** Ports must be integers between 1 and 65535:
```bash
# Good:
KISMET_PORT=8001
EMAIL_PORT=587

# Bad:
KISMET_PORT=8001.5
EMAIL_PORT=999999
```

### Issue: "Invalid email format"
**Solution:** Email addresses must contain '@':
```bash
# Good:
EMAIL_FROM=alerts@example.com
EMAIL_TO=admin@company.com

# Bad:
EMAIL_FROM=alerts
EMAIL_TO=admin.company.com
```

### Issue: WebSocket keeps reconnecting
**Solution:** Check if Kismet server is running and accessible:
```bash
ping <KISMET_HOST>
curl http://<KISMET_HOST>:<KISMET_PORT>
```

### Issue: Emails not sending
**Solution:** Check SMTP credentials and enable debug logging:
```bash
LOG_LEVEL=DEBUG npm start
# Look for "Message sent successfully" or retry attempts
```

---

## Testing the Improvements

### Test 1: Configuration Validation
```bash
# Unset a required variable
unset KISMET_HOST
npm start
# Should exit immediately with clear error
```

### Test 2: Auto-Reconnection
```bash
npm start
# While running, stop Kismet server
sleep 5
# Restart Kismet server
# App should reconnect automatically within 60s
```

### Test 3: Error Handling
Send a malformed JSON message to the WebSocket - app should log the error and continue (not crash).

### Test 4: Graceful Shutdown
```bash
npm start
# Let it run for a few seconds
# Press Ctrl+C
# Should send shutdown email and exit within 5 seconds
```

### Test 5: Alert History Limits
Trigger 150 device found alerts, verify only 100 stored.

---

## Environment Variables

### Required (Validated at Startup)

**Kismet Connection:**
| Variable | Example | Notes |
|----------|---------|-------|
| KISMET_HOST | 192.168.1.100 | Hostname or IP |
| KISMET_PORT | 8001 | 1-65535 |
| KISMET_USERNAME | admin | Authentication |
| KISMET_PASSWORD | kismet | Authentication |

**Email Configuration:**
| Variable | Example | Notes |
|----------|---------|-------|
| EMAIL_HOST | smtp.example.com | SMTP server |
| EMAIL_PORT | 587 | 1-65535, usually 587 or 465 |
| EMAIL_USER | alerts@example.com | SMTP user |
| EMAIL_PASS | password123 | SMTP password |
| EMAIL_FROM | kismet-alerts@example.com | Must contain @ |
| EMAIL_TO | security@example.com | Must contain @ |

### Optional

| Variable | Values | Default |
|----------|--------|---------|
| LOG_LEVEL | DEBUG, INFO, WARN, ERROR | INFO |

---

## Monitoring the Application

### Normal Startup
```
[2026-02-09T10:45:23.123Z] INFO: Configuration validated successfully
[2026-02-09T10:45:23.234Z] INFO: Creating WebSocket connection to Kismet {host: "localhost"}
[2026-02-09T10:45:23.567Z] INFO: WebSocket connection established
[2026-02-09T10:45:23.678Z] INFO: WebSocket connection ready, subscribing to ALERT events
```

### When Kismet Restarts
```
[2026-02-09T10:50:00.123Z] ERROR: WebSocket closed unexpectedly {code: 1006, failureCount: 1, maxFailures: 10}
[2026-02-09T10:50:01.234Z] INFO: Scheduling reconnection {delayMs: 1050, nextAttempt: 1}
... [wait 1 second] ...
[2026-02-09T10:50:02.456Z] INFO: Creating WebSocket connection to Kismet {attempt: 2}
[2026-02-09T10:50:02.789Z] INFO: WebSocket connection established
```

### When Alert Triggers
```
[2026-02-09T10:55:30.123Z] INFO: Processing alert
[2026-02-09T10:55:30.234Z] INFO: Processing device found alert {mac: "AA:BB:CC:DD:EE:FF", message: "Security Camera", channel: "6"}
[2026-02-09T10:55:30.456Z] DEBUG: Sending email (attempt 1/4) {subject: "Alert: Security Camera on channel 6"}
[2026-02-09T10:55:31.789Z] INFO: Message sent successfully {subject: "Alert: Security Camera on channel 6", response: "250 Message accepted"}
```

### When Email Fails (Brief Retry)
```
[2026-02-09T10:55:30.456Z] WARN: Email send failed {subject: "Alert: WiFi Scanner", attempt: 1, error: "connect ECONNREFUSED"}
[2026-02-09T10:55:32.567Z] WARN: Email send failed {subject: "Alert: WiFi Scanner", attempt: 2, error: "connect ECONNREFUSED"}
[2026-02-09T10:55:38.678Z] INFO: Retrying email send {subject: "Alert: WiFi Scanner", nextAttempt: 3, delayMs: 18000}
[2026-02-09T10:55:56.789Z] INFO: Message sent successfully {subject: "Alert: WiFi Scanner"}
```

---

## File Locations

| File | Purpose |
|------|---------|
| kismetalerts.js | Entry point (WebSocket, signals, startup) |
| processalert.js | Alert parsing (history, validation) |
| mail.js | Email sending (retry logic) |
| logger.js | Structured logging (timestamps, levels) |
| config.js | Configuration validation |
| websocket-manager.js | WebSocket auto-reconnect |
| macmessagemappings.js | Your device MAC-to-message mappings |
| .env | Configuration (git-ignored) |

---

## Documentation

For detailed technical documentation, see:
- **RELIABILITY_IMPROVEMENTS.md** - Complete implementation details
- **CLAUDE.md** - Original project architecture

---

## Need Help?

Check the logs with debug level:
```bash
LOG_LEVEL=DEBUG npm start 2>&1 | tee debug.log
```

Review RELIABILITY_IMPROVEMENTS.md for:
- Detailed feature descriptions
- How to verify each improvement
- Architecture diagrams
- Troubleshooting guide

---

## Summary

✓ Configuration validated at startup (no silent failures)
✓ Structured logging with timestamps (easy debugging)
✓ WebSocket auto-reconnects (survives server restarts)
✓ Email retries automatically (survives brief outages)
✓ Alert history bounded (no memory leaks)
✓ Graceful shutdown (clean exit, final notifications)
✓ Error handlers everywhere (no silent crashes)

**Result:** Production-ready system that continues monitoring even when things go wrong!
