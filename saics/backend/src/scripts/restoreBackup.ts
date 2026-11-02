import "dotenv/config";
import readline from "readline/promises";
import { stdin, stdout } from "process";
import { recordAudit } from "../services/auditLog";
import { BACKUP_NAME_PATTERN, restoreBackup } from "../services/backupService";
import { pool } from "../config/db";

async function runRestore() {
  const [name, ...options] = process.argv.slice(2);
  const force = options.includes("--force");
  if (!name || !BACKUP_NAME_PATTERN.test(name) || options.some((option) => option !== "--force")) {
    console.error("Usage: npm run restore:backup -- <backup-file.sql[.gz]> [--force]");
    process.exitCode = 1;
    await pool.end();
    return;
  }
  if (process.env.NODE_ENV === "production" && !force) {
    console.error("Production restore refused. Re-run with --force after verifying the target database.");
    process.exitCode = 1;
    await pool.end();
    return;
  }

  const terminal = readline.createInterface({ input: stdin, output: stdout });
  try {
    const confirmation = await terminal.question(
      `This will restore ${name} into ${process.env.DB_NAME || "saics_db"}. Type RESTORE to continue: `
    );
    if (confirmation !== "RESTORE") {
      console.error("Restore cancelled.");
      process.exitCode = 1;
      return;
    }

    await restoreBackup(name);
    await recordAudit({
      targetType: "database_backup",
      targetId: name,
      action: "admin.backup.restore",
      after: { success: true },
    });
    console.log(`Restored ${name} successfully.`);
  } catch {
    try {
      await recordAudit({
        targetType: "database_backup",
        targetId: name,
        action: "admin.backup.restore",
        after: { success: false },
      });
    } catch (auditError) {
      console.error("Could not audit database restore failure.", auditError);
    }
    console.error("Database restore failed. Check the backup checksum, MySQL configuration, and server logs.");
    process.exitCode = 1;
  } finally {
    terminal.close();
    await pool.end();
  }
}

void runRestore();
