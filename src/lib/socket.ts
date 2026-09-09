import { io, Socket } from 'socket.io-client';

let socket: Socket | undefined;

/** Default port the Socket.io game server listens on (see server/server.js). */
const DEFAULT_SOCKET_PORT = 3001;

/**
 * Where the browser should reach the Socket.io server.
 *
 * `NEXT_PUBLIC_*` values are inlined into the client bundle at BUILD time, so a
 * hardcoded URL would pin a published Docker image to one host. When it is left
 * unset we derive the URL from the page's own origin instead, which keeps the
 * image portable: the socket server is assumed to run on the same host.
 *
 * Set NEXT_PUBLIC_SOCKET_URL at build time when the socket server lives
 * somewhere else, or behind a TLS-terminating proxy on a different hostname.
 */
function resolveSocketUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (configured) return configured;

  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:${DEFAULT_SOCKET_PORT}`;
}

/**
 * Returns the singleton Socket.io client instance.
 *
 * Using a singleton prevents double-connections under React 18 StrictMode
 * (which mounts components twice in development).
 *
 * The socket is lazily connected — call socket.connect() in a useEffect.
 */
export function getSocket(): Socket {
  if (typeof window === 'undefined') {
    throw new Error('getSocket() must only be called in the browser.');
  }

  if (!socket) {
    socket = io(resolveSocketUrl(), {
      autoConnect: false, // We connect explicitly inside useGame
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }

  return socket;
}
