import { createReadStream } from "fs";
import { Request, Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { recordAudit } from "../services/auditLog";
import {
  BACKUP_NAME_PATTERN,
  createBackup,
  getBackupFile,
  listBackups,
} from "../services/backupService";

type AdminRequest = AuthRequest & Request;

async function auditBackupAction(
  req: AdminRequest,
  action: string,
  targetId?: string,
  after?: unknown
): Promise<void> {
  await recordAudit({
    actorId: req.studentId,
    targetType: "database_backup",
    targetId: targetId ?? null,
    action,
    after,
    ipAddress: req.ip,
  });
}

export async function postBackup(req: AdminRequest, res: Response) {
  let result: Awaited<ReturnType<typeof createBackup>>;
  try {
    result = await createBackup();
  } catch {
    try {
      await auditBackupAction(req, "admin.backup.create", undefined, { success: false });
    } catch (auditError) {
      console.error("Could not audit failed database backup request.", auditError);
    }
    console.error("Database backup failed.");
    return res.status(500).json({ message: "Database backup failed. Check the server logs." });
  }

  try {
    await auditBackupAction(req, "admin.backup.create", result.backup.name, {
      success: true,
      size: result.backup.size,
      copied: result.backup.copied,
      copyError: result.copyError,
      retentionError: result.retentionError,
    });
  } catch (error) {
    console.error("Database backup completed, but its audit event could not be recorded.", error);
    return res.status(500).json({ message: "Backup completed, but its audit event could not be recorded." });
  }
  return res.json(result);
}

export async function getBackups(req: AdminRequest, res: Response) {
  let result: Awaited<ReturnType<typeof listBackups>>;
  try {
    result = await listBackups();
  } catch {
    try {
      await auditBackupAction(req, "admin.backup.list", undefined, { success: false });
    } catch (error) {
      console.error("Could not audit failed backup listing request.", error);
    }
    console.error("Could not list database backups.");
    return res.status(500).json({ message: "Could not list database backups." });
  }
  try {
    await auditBackupAction(req, "admin.backup.list", undefined, {
      count: result.backups.length,
      success: true,
    });
    return res.json(result);
  } catch (error) {
    console.error("Could not audit database backup listing.", error);
    return res.status(500).json({ message: "Could not audit database backup listing." });
  }
}

export async function downloadBackup(req: AdminRequest, res: Response) {
  const name = req.params.name;
  if (!BACKUP_NAME_PATTERN.test(name)) {
    try {
      await auditBackupAction(req, "admin.backup.download.rejected", name, { success: false });
    } catch (error) {
      console.error("Could not audit rejected backup download.", error);
      return res.status(500).json({ message: "Could not audit backup download request." });
    }
    return res.status(400).json({ message: "Invalid backup file name." });
  }

  let filePath: string;
  try {
    filePath = await getBackupFile(name);
  } catch {
    try {
      await auditBackupAction(req, "admin.backup.download", name, { success: false });
    } catch (error) {
      console.error("Could not audit missing backup download.", error);
      return res.status(500).json({ message: "Could not audit backup download request." });
    }
    return res.status(404).json({ message: "Backup file not found." });
  }

  try {
    await auditBackupAction(req, "admin.backup.download", name, { success: true });
  } catch (error) {
    console.error("Could not audit backup download.", error);
    return res.status(500).json({ message: "Could not audit backup download request." });
  }

  res.setHeader("Content-Type", "application/sql");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  const stream = createReadStream(filePath);
  stream.once("error", () => {
    console.error("Could not stream database backup.");
    if (!res.headersSent) res.status(500).json({ message: "Could not download database backup." });
    else res.destroy();
  });
  return stream.pipe(res);
}
