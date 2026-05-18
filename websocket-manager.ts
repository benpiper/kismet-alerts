import WebSocket from 'ws';
import { logger } from './logger.ts';

const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 60000;
const BACKOFF_MULTIPLIER = 2;
const MAX_FAILURES = 10;
const JITTER_FACTOR = 0.2; // ±20%

type OnMessageHandler = (event: WebSocket.MessageEvent) => void;
type OnReadyHandler = (ws: WebSocket) => void;

interface WebSocketManager {
  close: () => void;
  getWebSocket: () => WebSocket | null;
}

function calculateDelay(attemptNumber: number): number {
  let delay = INITIAL_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, attemptNumber);
  delay = Math.min(delay, MAX_DELAY_MS);

  // Apply jitter: ±20%
  const jitterAmount = delay * JITTER_FACTOR;
  const jitterVariation = (Math.random() - 0.5) * 2 * jitterAmount;
  delay += jitterVariation;

  return Math.max(INITIAL_DELAY_MS, Math.round(delay));
}

export function createWebSocketConnection(
  url: string,
  onMessage?: OnMessageHandler,
  onReady?: OnReadyHandler
): WebSocketManager {
  let failureCount = 0;
  let reconnectAttempt = 0;
  let ws: WebSocket | null = null;
  let isIntentionallyClosed = false;

  function connect(): void {
    try {
      logger.info('Creating WebSocket connection', { url, attempt: reconnectAttempt + 1 });
      ws = new WebSocket(url);

      ws.onopen = () => {
        logger.info('WebSocket connection established');
        failureCount = 0;
        reconnectAttempt = 0;
        if (onReady && ws) {
          onReady(ws);
        }
      };

      ws.onmessage = (event: WebSocket.MessageEvent) => {
        if (onMessage) {
          try {
            onMessage(event);
          } catch (err) {
            const error = err as Error;
            logger.error('Error processing WebSocket message', {
              error: error.message,
              stack: error.stack,
            });
          }
        }
      };

      ws.onerror = (event: WebSocket.ErrorEvent) => {
        logger.error('WebSocket error', {
          message: (event as any).message || 'Unknown error',
        });
      };

      ws.onclose = (event: WebSocket.CloseEvent) => {
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
          process.emit('websocket-fatal-error' as unknown as any, new Error('Max reconnection attempts reached'));
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
      const error = err as Error;
      logger.error('Failed to create WebSocket connection', {
        error: error.message,
        attempt: reconnectAttempt + 1,
      });

      failureCount++;
      if (failureCount >= MAX_FAILURES) {
        logger.error('Max connection attempts reached', { attempts: failureCount });
        process.emit('websocket-fatal-error' as unknown as any, error);
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
