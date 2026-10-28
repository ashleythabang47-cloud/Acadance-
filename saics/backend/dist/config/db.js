"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.testConnection = testConnection;
const promise_1 = __importDefault(require("mysql2/promise"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Connection pool - reused across the app rather than opening a new
// connection per request (much better for performance).
exports.pool = promise_1.default.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "saics_db",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});
// Quick helper to verify the DB is reachable on startup.
async function testConnection() {
    try {
        const conn = await exports.pool.getConnection();
        console.log("✅ MySQL connected successfully");
        conn.release();
    }
    catch (err) {
        console.error("❌ Failed to connect to MySQL:", err);
        process.exit(1);
    }
}
