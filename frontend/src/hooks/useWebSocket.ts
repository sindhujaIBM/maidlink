import { useCallback, useEffect, useRef, useState } from 'react';

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface ServerMessage {
  type:        string;
  text?:       string;       // guidance_chunk
  data?:       string;       // audio base64
  mimeType?:   string;       // audio/mpeg
  room?:       string;       // room_complete
  summary?:    unknown;      // room_complete
  result?:     unknown;      // estimate_ready
  area?:       string;       // angle_request
  instruction?: string;      // angle_request
  message?:    string;       // error
}

interface UseWebSocketOptions {
  onMessage: (msg: ServerMessage) => void;
}

export function useWebSocket({ onMessage }: UseWebSocketOptions) {
  const [status, setStatus]   = useState<WsStatus>('idle');
  const wsRef                 = useRef<WebSocket | null>(null);
  const onMessageRef          = useRef(onMessage);
  const reconnectAttemptsRef  = useRef(0);

  onMessageRef.current = onMessage;

  const connect = useCallback((url: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('open');
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as ServerMessage;
        onMessageRef.current(msg);
      } catch {
        console.error('WS parse error', e.data);
      }
    };

    ws.onerror = () => setStatus('error');

    ws.onclose = () => {
      setStatus('closed');
      wsRef.current = null;
    };
  }, []);

  const send = useCallback((action: string, payload: Record<string, unknown> = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, ...payload }));
    }
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  useEffect(() => () => { wsRef.current?.close(); }, []);

  return { status, connect, send, disconnect };
}
