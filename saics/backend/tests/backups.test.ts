import { EventEmitter } from "events";
import { PassThrough } from "stream";
import childProcess from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../src/app";
import { StudentModel } from "../src/models/studentModel";
import { recordAudit } from "../src/services/auditLog";
import { createBackup, pruneOldBackups } from "../src/services/backupService";

jest.mock("../src/models/studentModel");
jest.mock("../src/services/auditLog");
jest.mock("child_process", () => ({
  ...jest.requireActual("child_process"),
  spawn: jest.fn(),
}));

const mockedStudentModel = StudentModel as jest.Mocked<typeof StudentModel>;
const mockedRecordAudit = recordAudit as jest.MockedFunction<typeof recordAudit>;
const mockedSpawn = childProcess.spawn as jest.Mock;
const jwtSecret = process.env.JWT_SECRET!;
const originalBackupDir = process.env.BACKUP_DIR;
const originalCopyDir = process.env.BACKUP_COPY_DIR;
const originalDatabasePassword = process.env.DB_PASSWORD;

let backupDir = "";
let outsideDir = "";

function authorization(role: "admin" | "student", studentId: number) {
  const token = jwt.sign({ studentId }, jwtSecret);
  return `Bearer ${token}`;
}

function formattedDate(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

beforeEach(async () => {
  jest.clearAllMocks();
  backupDir = await fs.mkdtemp(path.join(os.tmpdir(), "acadance-backups-"));
  outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "acadance-outside-"));
  process.env.BACKUP_DIR = backupDir;
  delete process.env.BACKUP_COPY_DIR;
  mockedRecordAudit.mockResolvedValue(undefined);
  mockedStudentModel.findAuthState.mockImplementation(async (studentId) => ({
    role: studentId === 10 ? "admin" : "student",
    is_suspended: false,
    deleted_at: null,
    token_version: 0,
    force_password_reset: false,
  }));
});

afterEach(async () => {
  await fs.rm(backupDir, { recursive: true, force: true });
  await fs.rm(outsideDir, { recursive: true, force: true });
  if (originalBackupDir === undefined) delete process.env.BACKUP_DIR;
  else process.env.BACKUP_DIR = originalBackupDir;
  if (originalCopyDir === undefined) delete process.env.BACKUP_COPY_DIR;
  else process.env.BACKUP_COPY_DIR = originalCopyDir;
  if (originalDatabasePassword === undefined) delete process.env.DB_PASSWORD;
  else process.env.DB_PASSWORD = originalDatabasePassword;
});

describe("admin database backup endpoints", () => {
  it("T1: refuses backup endpoint access from a student token", async () => {
    const auth = authorization("student", 20);
    await request(app).get("/api/admin/backups").set("Authorization", auth).expect(403);
    await request(app).post("/api/admin/backups").set("Authorization", auth).expect(403);
    await request(app)
      .get("/api/admin/backups/saics_db_20261010_020000.sql/download")
      .set("Authorization", auth)
      .expect(403);
  });

  it("T2: rejects traversal-like backup download names", async () => {
    const response = await request(app)
      .get(`/api/admin/backups/${encodeURIComponent("../../.env")}/download`)
      .set("Authorization", authorization("admin", 10))
      .expect(400);

    expect(response.body.message).toMatch(/invalid backup file name/i);
    expect(mockedRecordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.backup.download.rejected",
    }));
  });
});

describe("backup service safety", () => {
  it("T3: retains the latest 14 dates and only deletes within BACKUP_DIR", async () => {
    const today = new Date();
    for (let age = 0; age < 16; age += 1) {
      const date = new Date(Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() - age
      ));
      const name = `saics_db_${formattedDate(date)}_020000.sql`;
      await fs.writeFile(path.join(backupDir, name), "dump");
      await fs.writeFile(path.join(backupDir, `${name}.sha256`), "checksum");
    }
    const outsideBackup = path.join(outsideDir, "saics_db_20200101_020000.sql");
    await fs.writeFile(outsideBackup, "must remain");
    await fs.writeFile(path.join(backupDir, "unrelated.sql"), "must remain");

    await pruneOldBackups();

    expect((await fs.readdir(backupDir)).filter((name) => /^saics_db_\d{8}_\d{6}\.sql$/.test(name)))
      .toHaveLength(14);
    await expect(fs.access(outsideBackup)).resolves.toBeUndefined();
    await expect(fs.readFile(path.join(backupDir, "unrelated.sql"), "utf8")).resolves.toBe("must remain");
  });

  it("T4: passes mysqldump an argument array and supplies the password only in child env", async () => {
    const password = "test-backup-password";
    process.env.DB_PASSWORD = password;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const child = new EventEmitter() as childProcess.ChildProcess;
    Object.assign(child, { stdout, stderr });
    mockedSpawn.mockImplementation((_command, _args, _options) => {
      process.nextTick(() => {
        stdout.end("mock database dump");
        stderr.end();
        child.emit("close", 0);
      });
      return child;
    });
    const consoleOutput = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const consoleErrors = jest.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const result = await createBackup();
      const [command, args, options] = mockedSpawn.mock.calls[0];
      expect(typeof command).toBe("string");
      expect(Array.isArray(args)).toBe(true);
      expect(args).toEqual(expect.arrayContaining([
        "--single-transaction", "--routines", "--triggers", "--events",
      ]));
      expect(args).not.toContain(password);
      expect(options.env.MYSQL_PWD).toBe(password);
      expect(options.env.DB_PASSWORD).toBeUndefined();
      expect(result.backup.size).toBeGreaterThan(0);
      expect(result.backup.checksumStatus).toBe("valid");
      expect(`${consoleOutput.mock.calls.flat().join(" ")}${consoleErrors.mock.calls.flat().join(" ")}`)
        .not.toContain(password);
    } finally {
      consoleOutput.mockRestore();
      consoleErrors.mockRestore();
    }
  });
});
