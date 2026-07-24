import dotenv from "dotenv";
import { createServer } from "http";
import app from "./app";
import { testConnection } from "./config/db";
import { attachSignaling } from "./sockets/signaling";

dotenv.config();

const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// WebRTC signaling (voice study sessions) rides on the same HTTP server.
attachSignaling(httpServer);

httpServer.listen(PORT, async () => {
  await testConnection();
  console.log(`🚀 SAICS backend running on http://localhost:${PORT}`);
});
