import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// Connection pool - reused across the app rather than opening a new
// connection per request (much better for performance).
export const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "saics_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // mysql2 returns DATE/DATETIME columns as native JS Date objects by
  // default. Every date field in this codebase (streaks, performance
  // records, sessions, notifications) is handled as a plain "YYYY-MM-DD"
  // string, so this keeps the driver's output consistent with that —
  // without it, date comparisons (like the streak-gap calculation)
  // silently break.
  dateStrings: true,
});

// Quick helper to verify the DB is reachable on startup.
export async function testConnection(): Promise<void> {
  try {
    const conn = await pool.getConnection();
    console.log("✅ MySQL connected successfully");
    conn.release();
  } catch (err) {
    console.error("❌ Failed to connect to MySQL:", err);
    process.exit(1);
  }
}
