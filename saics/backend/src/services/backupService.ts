import { createHash } from "crypto";
import {
  constants as fsConstants,
  createReadStream,
  createWriteStream,
  promises as fs,
} from "fs";
import path from "path";
import { spawn, SpawnOptions } from "child_process";
import { createGunzip, createGzip } from "zlib";
import { pipeline } from "stream/promises";
import { recordAudit } from "./auditLog";

export const BACKUP_NAME_PATTERN = /^saics_db_\d{8}_\d{6}\.sql(?:\.gz)?$/;
const CHECKSUM_SUFFIX = ".sha256";
const BACKUP_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export interface BackupEntry {
  name: string;
  size: number;
  date: string;
  checksumStatus: "valid" | "missing" | "invalid";
  copied: boolean;
}

export interface BackupResult {
  backup: BackupEntry;
  copyError: string | null;
  retentionError: string | null;
}

function backupDirectory(): string {
  return path.resolve(process.env.BACKUP_DIR || path.join(process.cwd(), "backups"));
}

function copyDirectory(): string | null {
  const configured = process.env.BACKUP_COPY_DIR?.trim();
  return configured ? path.resolve(configured) : null;
}

function backupPath(name: string): string {
  if (!BACKUP_NAME_PATTERN.test(name)) {
    throw new Error("Invalid backup file name.");
  }
  const root = backupDirectory();
  const resolved = path.resolve(root, name);
  if (path.dirname(resolved) !== root) {
    throw new Error("Invalid backup file name.");
  }
  return resolved;
}

async function assertRegularBackup(name: string): Promise<string> {
  const filePath = backupPath(name);
  const info = await fs.lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink() || info.size === 0) {
    throw new Error("Backup file is missing or invalid.");
  }
  const realPath = await fs.realpath(filePath);
  if (path.dirname(realPath) !== await fs.realpath(backupDirectory())) {
    throw new Error("Backup file is outside the configured backup directory.");
  }
  return filePath;
}

async function checksumFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

async function writeChecksum(filePath: string): Promise<string> {
  const checksum = await checksumFile(filePath);
  const checksumPath = `${filePath}${CHECKSUM_SUFFIX}`;
  const handle = await fs.open(checksumPath, "wx", 0o600);
  try {
    await handle.writeFile(`${checksum}  ${path.basename(filePath)}\n`, "utf8");
  } catch (error) {
    await handle.close();
    try {
      await fs.rm(checksumPath, { force: true });
    } catch {
      // Preserve the checksum write error.
    }
    throw error;
  }
  await handle.close();
  return checksum;
}

async function compressBackup(filePath: string): Promise<string> {
  const compressedPath = `${filePath}.gz`;
  const output = createWriteStream(compressedPath, { flags: "wx", mode: 0o600 });
  let createdFile = false;
  output.once("open", () => { createdFile = true; });
  try {
    await pipeline(
      createReadStream(filePath),
      createGzip(),
      output
    );
    await fs.unlink(filePath);
    return compressedPath;
  } catch (error) {
    if (createdFile) await fs.rm(compressedPath, { force: true });
    throw error;
  }
}

function spawnOptions(env: NodeJS.ProcessEnv, stdin: "ignore" | "pipe" = "ignore"): SpawnOptions {
  return { env, stdio: [stdin, "pipe", "pipe"], windowsHide: true };
}

function databaseClientEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const password = env.DB_PASSWORD || "";
  delete env.DB_PASSWORD;
  env.MYSQL_PWD = password;
  return env;
}

async function runDump(filePath: string): Promise<void> {
  const dumpPath = process.env.MYSQLDUMP_PATH || "C:\\xampp\\mysql\\bin\\mysqldump.exe";
  const args = [
    "--single-transaction",
    "--routines",
    "--triggers",
    "--events",
    `--host=${process.env.DB_HOST || "localhost"}`,
    `--port=${process.env.DB_PORT || "3306"}`,
    `--user=${process.env.DB_USER || "root"}`,
    process.env.DB_NAME || "saics_db",
  ];
  const child = spawn(dumpPath, args, spawnOptions(databaseClientEnvironment()));
  child.stderr?.resume();
  const outputFile = createWriteStream(filePath, { flags: "wx", mode: 0o600 });
  let createdFile = false;
  outputFile.once("open", () => { createdFile = true; });
  const output = pipeline(child.stdout!, outputFile);
  const exit = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
  try {
    const [, code] = await Promise.all([output, exit]);
    if (code !== 0) {
      throw new Error(`mysqldump exited with status ${code}.`);
    }
  } catch (error) {
    if (!child.killed) child.kill();
    if (createdFile) await fs.rm(filePath, { force: true });
    throw error;
  }
}

function dayFromBackupName(name: string): string {
  return name.slice("saics_db_".length, "saics_db_".length + 8);
}

function isWithinDirectory(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." &&
    !path.isAbsolute(relative);
}

export async function pruneOldBackups(): Promise<void> {
  const root = backupDirectory();
  await fs.mkdir(root, { recursive: true });
  const entries = await fs.readdir(root, { withFileTypes: true });
  const backups = entries
    .filter((entry) => entry.isFile() && BACKUP_NAME_PATTERN.test(entry.name))
    .map((entry) => entry.name);
  const days = [...new Set(backups.map(dayFromBackupName))].sort().reverse();
  const retainedDays = new Set(days.slice(0, 14));

  for (const name of backups) {
    if (retainedDays.has(dayFromBackupName(name))) continue;
    const filePath = path.resolve(root, name);
    if (!isWithinDirectory(root, filePath)) continue;
    const info = await fs.lstat(filePath);
    if (!info.isFile() || info.isSymbolicLink()) continue;
    await fs.unlink(filePath);
    const checksumPath = `${filePath}${CHECKSUM_SUFFIX}`;
    try {
      const checksumInfo = await fs.lstat(checksumPath);
      if (checksumInfo.isFile() && !checksumInfo.isSymbolicLink()) {
        await fs.unlink(checksumPath);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

async function describeBackup(name: string): Promise<BackupEntry> {
  const filePath = await assertRegularBackup(name);
  const info = await fs.stat(filePath);
  let checksumStatus: BackupEntry["checksumStatus"] = "missing";
  try {
    const checksumPath = `${filePath}${CHECKSUM_SUFFIX}`;
    const checksumInfo = await fs.lstat(checksumPath);
    if (!checksumInfo.isFile() || checksumInfo.isSymbolicLink()) {
      checksumStatus = "invalid";
    } else {
      const stored = await fs.readFile(checksumPath, "utf8");
      const expected = stored.match(/^([a-f0-9]{64})\s+/i)?.[1]?.toLowerCase();
      checksumStatus = expected && expected === await checksumFile(filePath) ? "valid" : "invalid";
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const copyRoot = copyDirectory();
  let copied = false;
  if (copyRoot) {
    try {
      const copiedFile = path.resolve(copyRoot, name);
      const copiedFileInfo = await fs.lstat(copiedFile);
      const copiedChecksum = await fs.readFile(`${copiedFile}${CHECKSUM_SUFFIX}`, "utf8");
      copied = copiedFileInfo.isFile() &&
        !copiedFileInfo.isSymbolicLink() &&
        copiedChecksum === await fs.readFile(`${filePath}${CHECKSUM_SUFFIX}`, "utf8") &&
        await checksumFile(copiedFile) === await checksumFile(filePath);
    } catch {
      copied = false;
    }
  }
  return {
    name,
    size: info.size,
    date: info.mtime.toISOString(),
    checksumStatus,
    copied,
  };
}

export async function createBackup(): Promise<BackupResult> {
  const root = backupDirectory();
  await fs.mkdir(root, { recursive: true });
  let now = new Date();
  let name = "";
  do {
    const timestamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      "_",
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("");
    name = `saics_db_${timestamp}.sql`;
    let available = true;
    for (const candidate of [name, `${name}.gz`]) {
      try {
        await fs.access(backupPath(candidate));
        available = false;
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    if (available) break;
    now = new Date(now.getTime() + 1000);
  } while (true);
  let filePath = backupPath(name);
  let createdFile = false;
  let createdChecksum = false;

  try {
    await runDump(filePath);
    createdFile = true;
    const info = await fs.stat(filePath);
    if (!info.isFile() || info.size === 0) {
      throw new Error("mysqldump produced an empty backup file.");
    }
    if (process.env.BACKUP_GZIP?.toLowerCase() === "true") {
      filePath = await compressBackup(filePath);
    }
    await writeChecksum(filePath);
    createdChecksum = true;

    let copyError: string | null = null;
    const destination = copyDirectory();
    if (destination) {
      try {
        await fs.mkdir(destination, { recursive: true });
        await fs.copyFile(
          filePath,
          path.join(destination, path.basename(filePath)),
          fsConstants.COPYFILE_EXCL
        );
        await fs.copyFile(
          `${filePath}${CHECKSUM_SUFFIX}`,
          path.join(destination, `${path.basename(filePath)}${CHECKSUM_SUFFIX}`),
          fsConstants.COPYFILE_EXCL
        );
      } catch {
        copyError = "Backup succeeded locally, but the off-machine copy failed.";
      }
    }
    let retentionError: string | null = null;
    try {
      await pruneOldBackups();
    } catch {
      retentionError = "Backup succeeded, but old backup retention cleanup failed.";
      console.error(retentionError);
    }
    return {
      backup: await describeBackup(path.basename(filePath)),
      copyError,
      retentionError,
    };
  } catch (error) {
    if (createdFile) {
      try {
        await fs.rm(filePath, { force: true });
        if (createdChecksum) {
          await fs.rm(`${filePath}${CHECKSUM_SUFFIX}`, { force: true });
        }
      } catch {
        // Preserve the dump error while best-effort cleanup removes incomplete output.
      }
    }
    throw error;
  }
}

export async function listBackups(): Promise<{
  backups: BackupEntry[];
  lastSuccessfulBackup: string | null;
  offMachineCopyConfigured: boolean;
}> {
  const root = backupDirectory();
  await fs.mkdir(root, { recursive: true });
  const entries = await fs.readdir(root, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isFile() && BACKUP_NAME_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  const backups: BackupEntry[] = [];
  for (const name of names) {
    backups.push(await describeBackup(name));
  }
  return {
    backups,
    lastSuccessfulBackup: backups.find((backup) => backup.checksumStatus === "valid")?.date ?? null,
    offMachineCopyConfigured: Boolean(copyDirectory()),
  };
}

export async function getBackupFile(name: string): Promise<string> {
  return assertRegularBackup(name);
}

export async function restoreBackup(name: string): Promise<void> {
  const filePath = await assertRegularBackup(name);
  const checksum = await describeBackup(name);
  if (checksum.checksumStatus !== "valid") {
    throw new Error("Backup checksum is missing or invalid.");
  }
  const mysqlPath = process.env.MYSQL_PATH || "C:\\xampp\\mysql\\bin\\mysql.exe";
  const args = [
    `--host=${process.env.DB_HOST || "localhost"}`,
    `--port=${process.env.DB_PORT || "3306"}`,
    `--user=${process.env.DB_USER || "root"}`,
    process.env.DB_NAME || "saics_db",
  ];
  const child = spawn(
    mysqlPath,
    args,
    spawnOptions(databaseClientEnvironment(), "pipe")
  );
  child.stdout?.resume();
  child.stderr?.resume();
  const input = filePath.endsWith(".gz")
    ? pipeline(createReadStream(filePath), createGunzip(), child.stdin!)
    : pipeline(createReadStream(filePath), child.stdin!);
  const exit = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
  const [, code] = await Promise.all([input, exit]);
  if (code !== 0) {
    throw new Error(`mysql restore exited with status ${code}.`);
  }
}

export function getBackupCronTime(): string {
  const configured = process.env.BACKUP_CRON || "02:00";
  if (!BACKUP_TIME_PATTERN.test(configured)) {
    throw new Error("BACKUP_CRON must use 24-hour HH:MM format.");
  }
  return configured;
}

export function startBackupSchedule(): void {
  const schedule = () => {
    const [hour, minute] = getBackupCronTime().split(":").map(Number);
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const delay = Math.min(next.getTime() - now.getTime(), 2_147_000_000);
    setTimeout(async () => {
      try {
        const result = await createBackup();
        await recordAudit({
          targetType: "database_backup",
          targetId: result.backup.name,
          action: "admin.backup.scheduled",
          after: {
            success: true,
            copied: result.backup.copied,
            copyError: result.copyError,
            retentionError: result.retentionError,
          },
        });
        if (result.copyError) console.error(result.copyError);
      } catch (error) {
        console.error("Scheduled database backup failed.");
        try {
          await recordAudit({
            targetType: "database_backup",
            action: "admin.backup.scheduled",
            after: { success: false },
          });
        } catch (auditError) {
          console.error("Could not audit scheduled database backup failure.", auditError);
        }
      }
      schedule();
    }, delay);
  };

  try {
    schedule();
  } catch (error) {
    console.error("Database backup schedule is invalid.", error);
  }
}
