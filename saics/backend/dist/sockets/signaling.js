"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachSignaling = attachSignaling;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
// room -> list of peers currently connected, kept in memory. This is
// presence/signaling state only — the source of truth for who's actually
// "in" a session long-term still lives in study_session_participants.
const rooms = new Map();
function attachSignaling(httpServer) {
    const io = new socket_io_1.Server(httpServer, {
        cors: { origin: "*" },
    });
    // Verify the JWT on connection so only logged-in students can join a room.
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token)
            return next(new Error("No auth token provided."));
        try {
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            socket.studentId = decoded.studentId;
            next();
        }
        catch {
            next(new Error("Invalid or expired token."));
        }
    });
    io.on("connection", (socket) => {
        const studentId = socket.studentId;
        socket.on("join-room", ({ sessionId, fullName }) => {
            const room = `session-${sessionId}`;
            socket.join(room);
            const existing = rooms.get(room) || [];
            // Tell the newcomer who's already here, so they can initiate a
            // peer connection to each existing participant.
            socket.emit("existing-peers", existing);
            const me = { socketId: socket.id, studentId, fullName };
            rooms.set(room, [...existing, me]);
            socket.to(room).emit("peer-joined", me);
            socket.currentRoom = room;
        });
        // Relays an SDP offer/answer or ICE candidate to one specific peer.
        socket.on("signal", ({ to, data }) => {
            io.to(to).emit("signal", { from: socket.id, data });
        });
        socket.on("leave-room", () => handleLeave(socket));
        socket.on("disconnect", () => handleLeave(socket));
    });
    function handleLeave(socket) {
        const room = socket.currentRoom;
        if (!room)
            return;
        const peers = rooms.get(room) || [];
        rooms.set(room, peers.filter((p) => p.socketId !== socket.id));
        socket.to(room).emit("peer-left", { socketId: socket.id });
        socket.leave(room);
    }
    return io;
}
