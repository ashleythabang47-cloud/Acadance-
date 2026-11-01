import "dotenv/config";
import { createServer } from "http";
import app from "./app";
import { testConnection } from "./config/db";
import { StudentModel } from "./models/studentModel";
import { attachSignaling } from "./sockets/signaling";

const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// WebRTC signaling (voice study sessions) rides on the same HTTP server.
attachSignaling(httpServer);

async function cleanupExpiredUnverifiedStudents() {
  try {
    const deletedCount = await StudentModel.cleanupExpiredUnverified();
    if (deletedCount > 0) {
      console.info(`Removed ${deletedCount} expired unverified student account(s).`);
    }
  } catch (error) {
    console.error("Failed to clean up expired unverified student accounts:", error);
  }
}

httpServer.listen(PORT, async () => {
  await testConnection();
  await cleanupExpiredUnverifiedStudents();
  setInterval(() => {
    void cleanupExpiredUnverifiedStudents();
  }, 60 * 60 * 1000);
  console.log(`🚀 SAICS backend running on http://localhost:${PORT}`);
});
