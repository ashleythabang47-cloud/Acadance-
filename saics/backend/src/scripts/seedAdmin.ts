import "dotenv/config";
import { pool } from "../config/db";
import { seedAdminAccount } from "../services/adminSeed";

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (12-128 characters, no more than 72 UTF-8 bytes).");
  }
  const result = await seedAdminAccount(email, password);
  console.log(result === "created" ? "Bootstrap admin created." : "Bootstrap admin already exists; no changes made.");
}

seedAdmin()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : "Admin seeding failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
