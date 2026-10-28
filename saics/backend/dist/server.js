"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = require("http");
const app_1 = __importDefault(require("./app"));
const db_1 = require("./config/db");
const signaling_1 = require("./sockets/signaling");
dotenv_1.default.config();
const httpServer = (0, http_1.createServer)(app_1.default);
const PORT = process.env.PORT || 5000;
// WebRTC signaling (voice study sessions) rides on the same HTTP server.
(0, signaling_1.attachSignaling)(httpServer);
httpServer.listen(PORT, async () => {
    await (0, db_1.testConnection)();
    console.log(`🚀 SAICS backend running on http://localhost:${PORT}`);
});
