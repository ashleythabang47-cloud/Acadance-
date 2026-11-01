export interface PasswordContext {
  email?: string;
  name?: string;
}

export type PasswordStrengthLevel = "weak" | "decent" | "strong";

export interface PasswordStrength {
  level: PasswordStrengthLevel;
  percent: 33 | 66 | 100;
  label: "Weak" | "Decent" | "Strong";
  hints: string[];
}

const commonPasswords = new Set([
  "password",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty",
  "qwerty123",
  "letmein",
  "welcome1",
  "admin123",
  "iloveyou",
  "abc12345",
  "11111111",
]);

function hasLongRepeatOrSequence(password: string): boolean {
  const value = password.toLowerCase();
  for (let index = 0; index <= value.length - 4; index += 1) {
    const characters = value.slice(index, index + 4);
    if (/^(.)\1{3}$/.test(characters)) return true;
    const codes = [...characters].map((character) => character.charCodeAt(0));
    const ascending = codes.every((code, offset) => offset === 0 || code === codes[offset - 1] + 1);
    const descending = codes.every((code, offset) => offset === 0 || code === codes[offset - 1] - 1);
    if (ascending || descending) return true;
  }
  return false;
}

export function getPasswordStrength(
  password: string,
  context: PasswordContext = {}
): PasswordStrength {
  const lower = password.toLowerCase();
  const types = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length;
  const identityParts = [
    context.email?.split("@")[0],
    ...(context.name?.split(/\s+/) ?? []),
  ].map((part) => part?.trim().toLowerCase()).filter((part): part is string => Boolean(part && part.length >= 3));
  const containsIdentity = identityParts.some((part) => lower.includes(part));
  const common = commonPasswords.has(lower);
  const hints: string[] = [];

  if (!password) {
    return { level: "weak", percent: 33, label: "Weak", hints };
  }
  if (password.length < 8) hints.push("Use 8+ characters");
  if (types < 2) {
    if (!/[A-Z]/.test(password)) hints.push("Add an uppercase letter");
    if (!/[a-z]/.test(password)) hints.push("Add a lowercase letter");
    if (!/\d/.test(password)) hints.push("Add a number");
    if (!/[^a-zA-Z0-9]/.test(password)) hints.push("Add a symbol");
  }
  if (password.length < 12) hints.push("Use 12+ characters");
  if (common) hints.push("Avoid common passwords");
  if (containsIdentity) hints.push("Don't include your name or email");
  if (hasLongRepeatOrSequence(password)) hints.push("Avoid long repeats or sequences");

  if (password.length < 8 || types < 2 || common || containsIdentity) {
    return { level: "weak", percent: 33, label: "Weak", hints };
  }

  if (password.length >= 12 && types >= 3 && !hasLongRepeatOrSequence(password)) {
    return { level: "strong", percent: 100, label: "Strong", hints: [] };
  }

  return { level: "decent", percent: 66, label: "Decent", hints };
}
