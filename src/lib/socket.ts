import { io, Socket } from 'socket.io-client';

let socket: Socket | undefined;

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
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
    socket = io(url, {
      autoConnect: false, // We connect explicitly inside useGame
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }

  return socket;
}
