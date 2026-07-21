import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

interface PeerInfo {
  socketId: string;
  studentId: number;
  fullName: string;
}

// room -> list of peers currently connected, kept in memory. This is
// presence/signaling state only — the source of truth for who's actually
// "in" a session long-term still lives in study_session_participants.
const rooms = new Map<string, PeerInfo[]>();

export function attachSignaling(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  // Verify the JWT on connection so only logged-in students can join a room.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No auth token provided."));
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { studentId: number };
      (socket as any).studentId = decoded.studentId;
      next();
    } catch {
      next(new Error("Invalid or expired token."));
    }
  });

  io.on("connection", (socket: Socket) => {
    const studentId = (socket as any).studentId as number;

    socket.on("join-room", ({ sessionId, fullName }: { sessionId: string; fullName: string }) => {
      const room = `session-${sessionId}`;
      socket.join(room);

      const existing = rooms.get(room) || [];

      // Tell the newcomer who's already here, so they can initiate a
      // peer connection to each existing participant.
      socket.emit("existing-peers", existing);

      const me: PeerInfo = { socketId: socket.id, studentId, fullName };
      rooms.set(room, [...existing, me]);

      socket.to(room).emit("peer-joined", me);
      (socket as any).currentRoom = room;
    });

    // Relays an SDP offer/answer or ICE candidate to one specific peer.
    socket.on("signal", ({ to, data }: { to: string; data: unknown }) => {
      io.to(to).emit("signal", { from: socket.id, data });
    });

    socket.on("leave-room", () => handleLeave(socket));
    socket.on("disconnect", () => handleLeave(socket));
  });

  function handleLeave(socket: Socket) {
    const room = (socket as any).currentRoom as string | undefined;
    if (!room) return;

    const peers = rooms.get(room) || [];
    rooms.set(
      room,
      peers.filter((p) => p.socketId !== socket.id)
    );

    socket.to(room).emit("peer-left", { socketId: socket.id });
    socket.leave(room);
  }

  return io;
}
