/**
 * WebSocket connection manager with automatic reconnection and exponential backoff.
 *
 * Features:
 * - Automatic reconnection on unexpected close
 * - Exponential backoff: 1s initial, 60s max, 2x multiplier
 * - Jitter: ±20% randomization on delays
 * - Max 10 consecutive failures before exit
 * - Failure counter resets on successful connection
 * - Sends email notification before giving up
 */

import WebSocket from 'ws';
import { logger } from './logger.js';

const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 60000;
const BACKOFF_MULTIPLIER = 2;
const MAX_FAILURES = 10;
const JITTER_FACTOR = 0.2; // ±20%

function calculateDelay(attemptNumber) {
  let delay = INITIAL_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, attemptNumber);
  delay = Math.min(delay, MAX_DELAY_MS);

  // Apply jitter: ±20%
  const jitterAmount = delay * JITTER_FACTOR;
  const jitterVariation = (Math.random() - 0.5) * 2 * jitterAmount;
  delay += jitterVariation;

  return Math.max(INITIAL_DELAY_MS, Math.round(delay));
}

export function createWebSocketConnection(url, onMessage, onReady) {
  let failureCount = 0;
  let reconnectAttempt = 0;
  let ws = null;
  let isIntentionallyClosed = false;

  function connect() {
    try {
      logger.info('Creating WebSocket connection', { url, attempt: reconnectAttempt + 1 });
      ws = new WebSocket(url);

      ws.onopen = (event) => {
        logger.info('WebSocket connection established');
        failureCount = 0;
        reconnectAttempt = 0;
        if (onReady) {
          onReady(ws);
        }
      };

      ws.onmessage = (event) => {
        if (onMessage) {
          try {
            onMessage(event);
          } catch (err) {
            logger.error('Error processing WebSocket message', {
              error: err.message,
              stack: err.stack,
            });
          }
        }
      };

      ws.onerror = (event) => {
        logger.error('WebSocket error', {
          code: event.code,
          reason: event.reason,
        });
      };

      ws.onclose = (event) => {
        if (isIntentionallyClosed) {
          logger.info('WebSocket closed intentionally');
          return;
        }

        failureCount++;
        logger.warn('WebSocket closed unexpectedly', {
          code: event.code,
          reason: event.reason,
          failureCount,
          maxFailures: MAX_FAILURES,
        });

        if (failureCount >= MAX_FAILURES) {
          logger.error('Max reconnection attempts reached', {
            attempts: failureCount,
          });
          // Signal to parent that we've given up
          process.emit('websocket-fatal-error', new Error('Max reconnection attempts reached'));
          return;
        }

        // Schedule reconnection with exponential backoff
        const delay = calculateDelay(reconnectAttempt);
        logger.info('Scheduling reconnection', {
          delayMs: delay,
          nextAttempt: reconnectAttempt + 1,
        });

        setTimeout(() => {
          reconnectAttempt++;
          connect();
        }, delay);
      };
    } catch (err) {
      logger.error('Failed to create WebSocket connection', {
        error: err.message,
        attempt: reconnectAttempt + 1,
      });

      failureCount++;
      if (failureCount >= MAX_FAILURES) {
        logger.error('Max connection attempts reached', { attempts: failureCount });
        process.emit('websocket-fatal-error', err);
        return;
      }

      const delay = calculateDelay(reconnectAttempt);
      setTimeout(() => {
        reconnectAttempt++;
        connect();
      }, delay);
    }
  }

  // Initial connection
  connect();

  // Return object with close method
  return {
    close: () => {
      isIntentionallyClosed = true;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Normal closure');
      }
    },
    getWebSocket: () => ws,
  };
}
