import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { StudentModel } from "../models/studentModel";
import { verifyAuthToken } from "../utils/authToken";

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
    void (async () => {
      try {
        const decoded = verifyAuthToken(token);
        const authState = await StudentModel.findAuthState(decoded.studentId);
        if (
          !authState ||
          authState.is_suspended ||
          authState.deleted_at ||
          Number(authState.token_version) !== Number(decoded.tokenVersion || 0)
        ) {
          return next(new Error("Invalid or expired token."));
        }
        socket.data.studentId = decoded.studentId;
        socket.data.tokenVersion = Number(decoded.tokenVersion || 0);
        next();
      } catch {
        next(new Error("Invalid or expired token."));
      }
    })();
  });

  io.on("connection", (socket: Socket) => {
    const studentId = socket.data.studentId as number;

    socket.on("join-room", async ({ sessionId, fullName }: { sessionId: string; fullName: string }) => {
      if (!(await isSocketAuthorized(socket))) return;
      const room = `session-${sessionId}`;
      socket.join(room);

      const existing = rooms.get(room) || [];

      // Tell the newcomer who's already here, so they can initiate a
      // peer connection to each existing participant.
      socket.emit("existing-peers", existing);

      const me: PeerInfo = { socketId: socket.id, studentId, fullName };
      rooms.set(room, [...existing, me]);

      socket.to(room).emit("peer-joined", me);
      socket.data.currentRoom = room;
    });

    // Relays an SDP offer/answer or ICE candidate to one specific peer.
    socket.on("signal", async ({ to, data }: { to: string; data: unknown }) => {
      if (!(await isSocketAuthorized(socket))) return;
      io.to(to).emit("signal", { from: socket.id, data });
    });

    socket.on("leave-room", () => handleLeave(socket));
    socket.on("disconnect", () => handleLeave(socket));
  });

  function handleLeave(socket: Socket) {
    const room = socket.data.currentRoom as string | undefined;
    if (!room) return;

    const peers = rooms.get(room) || [];
    rooms.set(
      room,
      peers.filter((p) => p.socketId !== socket.id)
    );

    socket.to(room).emit("peer-left", { socketId: socket.id });
    socket.leave(room);
  }

  async function isSocketAuthorized(socket: Socket): Promise<boolean> {
    try {
      const studentId = socket.data.studentId as number;
      const current = await StudentModel.findAuthState(studentId);
      if (
        !current ||
        current.is_suspended ||
        current.deleted_at ||
        Number(current.token_version) !== Number(socket.data.tokenVersion)
      ) {
        socket.disconnect(true);
        return false;
      }
      return true;
    } catch {
      socket.disconnect(true);
      return false;
    }
  }

  return io;
}
