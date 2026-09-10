import { useEffect, useRef, useState } from "react";
import { WS_URL } from "../api/client";
import type { Telemetry } from "../api/types";

export type WsStatus = "connecting" | "open" | "reconnecting" | "closed";

const RECONNECT_DELAY_MS = 2000;
const HISTORY_LENGTH = 40;

export interface TelemetryStream {
  status: WsStatus;
  latest: Telemetry | null;
  /** Rolling history of recent samples, oldest first, capped at HISTORY_LENGTH. */
  history: Telemetry[];
}

/**
 * Connects to the Java backend's live 1Hz telemetry WebSocket (ws://.../ws/telemetry).
 * Reconnects with a fixed backoff on close/error rather than giving up, since the demo
 * flow depends on this recovering automatically if the backend restarts.
 */
export function useTelemetryStream(): TelemetryStream {
  const [status, setStatus] = useState<WsStatus>("connecting");
  const [latest, setLatest] = useState<Telemetry | null>(null);
  const [history, setHistory] = useState<Telemetry[]>([]);
  const closedByEffect = useRef(false);

  useEffect(() => {
    closedByEffect.current = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      setStatus((previous) => (previous === "open" ? previous : "connecting"));
      socket = new WebSocket(WS_URL);

      socket.onopen = () => setStatus("open");

      socket.onmessage = (event) => {
        try {
          const telemetry = JSON.parse(event.data) as Telemetry;
          setLatest(telemetry);
          setHistory((previous) => {
            const next = [...previous, telemetry];
            return next.length > HISTORY_LENGTH ? next.slice(next.length - HISTORY_LENGTH) : next;
          });
        } catch {
          // Ignore malformed frames; the next tick will self-correct.
        }
      };

      const scheduleReconnect = () => {
        if (closedByEffect.current) return;
        setStatus("reconnecting");
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      socket.onclose = scheduleReconnect;
      socket.onerror = () => socket?.close();
    };

    connect();

    return () => {
      closedByEffect.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
      setStatus("closed");
    };
  }, []);

  return { status, latest, history };
}
