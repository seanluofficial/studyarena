import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, { autoConnect: false });
  }
  return socket;
}
