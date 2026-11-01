import { pool } from "../config/db";

export async function recordAudit(input: {
  actorId?: number | null;
  targetType: string;
  targetId?: string | number | null;
  action: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO audit_logs
      (actor_id, target_type, target_id, action, before_values, after_values, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.actorId ?? null,
      input.targetType,
      input.targetId === undefined || input.targetId === null ? null : String(input.targetId),
      input.action,
      input.before === undefined ? null : JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
      input.ipAddress?.slice(0, 45) || null,
    ]
  );
}
