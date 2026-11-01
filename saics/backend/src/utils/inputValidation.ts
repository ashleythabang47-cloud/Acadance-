import { promises as dns } from "dns";

export type ValidatedField = "fullName" | "email";

export interface FieldValidationError {
  field: ValidatedField;
  message: string;
}

export type ValidationResult<T> = { value: T; error?: never } | { value?: never; error: FieldValidationError };

export const NAME_CHARACTERS_MESSAGE = "Name can only contain letters, spaces, hyphens and apostrophes (full stops are also allowed).";
export const NAME_LENGTH_MESSAGE = "Name must be between 2 and 100 characters and contain at least 2 letters.";
export const EMAIL_FORMAT_MESSAGE = "Enter a valid email address.";
export const EMAIL_DOMAIN_MESSAGE = "The email domain does not exist or cannot receive mail.";

export function normalizeName(value: string): string {
  return value.trim().replace(/ +/g, " ");
}

export function validateName(value: unknown): ValidationResult<string> {
  if (typeof value !== "string") {
    return { error: { field: "fullName", message: NAME_LENGTH_MESSAGE } };
  }
  const normalized = normalizeName(value);
  const letters = normalized.match(/\p{L}/gu) ?? [];
  if (Array.from(normalized).length < 2 || Array.from(normalized).length > 100 || letters.length < 2) {
    return { error: { field: "fullName", message: NAME_LENGTH_MESSAGE } };
  }
  if (!/^[\p{L} .'-]+$/u.test(normalized)) {
    return { error: { field: "fullName", message: NAME_CHARACTERS_MESSAGE } };
  }
  return { value: normalized };
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateEmail(value: unknown): ValidationResult<string> {
  if (typeof value !== "string") {
    return { error: { field: "email", message: EMAIL_FORMAT_MESSAGE } };
  }
  const normalized = normalizeEmail(value);
  if (Array.from(normalized).length > 254) {
    return { error: { field: "email", message: "Email must be 254 characters or fewer." } };
  }

  const atIndex = normalized.indexOf("@");
  if (atIndex <= 0 || atIndex !== normalized.lastIndexOf("@")) {
    return { error: { field: "email", message: EMAIL_FORMAT_MESSAGE } };
  }
  const localPart = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  if (
    Array.from(localPart).length > 64 ||
    !/^[\p{L}\p{N}!#$%&'*+/=?^_`{|}~.-]+$/u.test(localPart) ||
    !/\p{L}/u.test(localPart) ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..")
  ) {
    return { error: { field: "email", message: EMAIL_FORMAT_MESSAGE } };
  }

  const labels = domain.split(".");
  const tld = labels[labels.length - 1] ?? "";
  const registrableLabel = labels[labels.length - 2] ?? "";
  if (
    labels.length < 2 ||
    labels.some((label, index) =>
      label.length === 0 ||
      label.length > 63 ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label) ||
      (label.length < 2 && index < labels.length - 2)
    ) ||
    !/^[a-z]{2,}$/i.test(tld) ||
    registrableLabel.length < 2 ||
    /^\d+$/.test(registrableLabel)
  ) {
    return { error: { field: "email", message: EMAIL_FORMAT_MESSAGE } };
  }
  return { value: normalized };
}

function isMissingDnsRecord(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && (error.code === "ENOTFOUND" || error.code === "ENODATA");
}

export async function emailDomainCanReceiveMail(email: string): Promise<boolean> {
  const domain = email.slice(email.lastIndexOf("@") + 1);
  const checkRecords = async (): Promise<boolean> => {
    try {
      const mxRecords = await dns.resolveMx(domain);
      if (mxRecords.length) return true;
    } catch (error) {
      if (!isMissingDnsRecord(error)) return true;
    }

    try {
      const addresses = await dns.resolve4(domain);
      return addresses.length > 0;
    } catch (error) {
      return !isMissingDnsRecord(error);
    }
  };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      checkRecords(),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(true), 3000);
        timeout.unref?.();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function validateEmailForAccount(value: unknown): Promise<ValidationResult<string>> {
  const result = validateEmail(value);
  if (result.error) return result;
  if (!(await emailDomainCanReceiveMail(result.value))) {
    return { error: { field: "email", message: EMAIL_DOMAIN_MESSAGE } };
  }
  return result;
}
