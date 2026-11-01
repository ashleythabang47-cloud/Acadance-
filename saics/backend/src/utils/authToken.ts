import jwt from "jsonwebtoken";

const JWT_SECRET: string = process.env.JWT_SECRET || "";
const jwtExpiresIn = process.env.JWT_EXPIRES_IN?.trim() || "7d";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be configured.");
}

if (!/^\d+(?:\.\d+)?\s*(?:ms|s|m|h|d|w|y)$/i.test(jwtExpiresIn)) {
  throw new Error("JWT_EXPIRES_IN must be a duration such as 7d.");
}

export const JWT_EXPIRES_IN = jwtExpiresIn as jwt.SignOptions["expiresIn"];

export interface AuthTokenPayload extends jwt.JwtPayload {
  studentId: number;
  tokenVersion?: number;
}

function isAuthTokenPayload(
  payload: string | jwt.JwtPayload
): payload is AuthTokenPayload {
  return (
    typeof payload !== "string" &&
    Number.isInteger(payload.studentId) &&
    (payload.tokenVersion === undefined || Number.isInteger(payload.tokenVersion))
  );
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const payload = jwt.verify(token, JWT_SECRET);
  if (!isAuthTokenPayload(payload)) {
    throw new Error("Invalid authentication token payload.");
  }
  return payload;
}

export { JWT_SECRET };
