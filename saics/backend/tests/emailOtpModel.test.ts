import { PoolConnection } from "mysql2/promise";
import { pool } from "../src/config/db";
import { EmailOtpModel } from "../src/models/emailOtpModel";
import { createOtp, hashOtp } from "../src/services/emailVerification";

jest.mock("../src/config/db", () => ({
  pool: { getConnection: jest.fn(), query: jest.fn() },
}));

interface OtpState {
  otp_hash: string;
  expires_at: Date;
  attempts: number;
  created_at: Date;
  is_active: boolean;
  is_expired: boolean;
}

let otpState: OtpState | null;
let emailVerified: boolean;
let resendCount: number;

const connection = {
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
  release: jest.fn(),
  query: jest.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes("SELECT student_id FROM students")) {
      return [[{ student_id: 42 }], []] as const;
    }
    if (sql.includes("SELECT otp_hash")) {
      return [[...(otpState ? [otpState] : [])], []] as const;
    }
    if (sql.includes("TIMESTAMPDIFF(SECOND, created_at")) {
      const secondsSinceCreated = otpState
        ? Math.floor((Date.now() - otpState.created_at.getTime()) / 1000)
        : null;
      return [[...(secondsSinceCreated === null ? [] : [{ seconds_since_created: secondsSinceCreated }])], []] as const;
    }
    if (sql.includes("SELECT COUNT(*) AS send_count")) {
      return [[{ send_count: resendCount }], []] as const;
    }
    if (sql.includes("INSERT INTO email_otps")) {
      otpState = {
        otp_hash: String(values?.[1]),
        expires_at: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
        created_at: new Date(),
        is_active: true,
        is_expired: false,
      };
      return [{ affectedRows: 1 }, []] as const;
    }
    if (sql.includes("DELETE FROM email_otps")) {
      otpState = null;
      return [{ affectedRows: 1 }, []] as const;
    }
    if (sql.includes("UPDATE email_otps SET attempts")) {
      if (otpState) otpState.attempts = Number(values?.[0]);
      return [{ affectedRows: 1 }, []] as const;
    }
    if (sql.includes("UPDATE students SET email_verified")) {
      emailVerified = true;
      return [{ affectedRows: 1 }, []] as const;
    }
    return [{ affectedRows: 0 }, []] as const;
  }),
};

jest.mock("../src/services/emailVerification", () => {
  const actual = jest.requireActual("../src/services/emailVerification");
  return actual;
});

beforeEach(() => {
  jest.clearAllMocks();
  otpState = null;
  emailVerified = false;
  resendCount = 0;
  jest.mocked(pool.getConnection).mockResolvedValue(connection as unknown as PoolConnection);
});

describe("EmailOtpModel.verify", () => {
  it("reserves only one resend within the cooldown", async () => {
    expect(await EmailOtpModel.reserveResend(42, hashOtp(createOtp()))).toBe(true);
    expect(await EmailOtpModel.reserveResend(42, hashOtp(createOtp()))).toBe(false);
  });

  it("blocks resends after five attempts in one hour", async () => {
    resendCount = 5;

    expect(await EmailOtpModel.reserveResend(42, hashOtp(createOtp()))).toBe(false);
    expect(connection.query).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO email_otps"),
      expect.anything()
    );
  });

  it("invalidates the code after five wrong attempts", async () => {
    otpState = {
      otp_hash: hashOtp(createOtp()),
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
      created_at: new Date(),
      is_active: true,
      is_expired: false,
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await EmailOtpModel.verify(42, hashOtp(createOtp()))).toBe(
        attempt === 4 ? "attempts-exceeded" : "hash-mismatch"
      );
    }

    expect(otpState).toBeNull();
    expect(emailVerified).toBe(false);
    expect(await EmailOtpModel.verify(42, hashOtp(createOtp()))).toBe("no-active-otp");
  });

  it("rejects and removes an expired code", async () => {
    otpState = {
      otp_hash: hashOtp(createOtp()),
      expires_at: new Date(Date.now() - 1),
      attempts: 0,
      created_at: new Date(),
      is_active: false,
      is_expired: true,
    };

    expect(await EmailOtpModel.verify(42, hashOtp(createOtp()))).toBe("expired");
    expect(otpState).toBeNull();
  });

  it("accepts a code once and rejects reuse", async () => {
    const otp = createOtp();
    otpState = {
      otp_hash: hashOtp(otp),
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
      created_at: new Date(),
      is_active: true,
      is_expired: false,
    };

    expect(await EmailOtpModel.verify(42, hashOtp(otp))).toBe("verified");
    expect(emailVerified).toBe(true);
    expect(otpState).toBeNull();
    expect(await EmailOtpModel.verify(42, hashOtp(otp))).toBe("no-active-otp");
  });

  it("verifies a leading-zero code", async () => {
    const otp = "004821";
    otpState = {
      otp_hash: hashOtp(otp),
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
      created_at: new Date(),
      is_active: true,
      is_expired: false,
    };

    expect(await EmailOtpModel.verify(42, hashOtp(otp))).toBe("verified");
  });

  it("uses MySQL expiry state rather than the JavaScript Date timezone", async () => {
    const otp = "004821";
    otpState = {
      otp_hash: hashOtp(otp),
      expires_at: new Date(Date.now() - 60 * 60 * 1000),
      attempts: 0,
      created_at: new Date(),
      is_active: true,
      is_expired: false,
    };

    expect(await EmailOtpModel.verify(42, hashOtp(otp))).toBe("verified");
    expect(connection.query).toHaveBeenCalledWith(
      expect.stringContaining("expires_at > NOW()"),
      [42]
    );
  });

  it("invalidates the previous code when a resend replaces it", async () => {
    const oldOtp = "004821";
    const newOtp = "901274";
    otpState = {
      otp_hash: hashOtp(oldOtp),
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
      created_at: new Date(Date.now() - 61 * 1000),
      is_active: true,
      is_expired: false,
    };

    expect(await EmailOtpModel.reserveResend(42, hashOtp(newOtp))).toBe(true);
    expect(await EmailOtpModel.verify(42, hashOtp(oldOtp))).toBe("hash-mismatch");
    expect(await EmailOtpModel.verify(42, hashOtp(newOtp))).toBe("verified");
  });
});
