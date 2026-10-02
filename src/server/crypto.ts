import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_WINDOW_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(secret, salt, 32)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = parts[1] ?? "";
  const hex = parts[2] ?? "";
  const derived = (await scryptAsync(secret, salt, 32)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

export function newSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export function sessionExpiry(now = Date.now()): number {
  return now + SESSION_MS;
}

export const sessionMaxAgeSec = SESSION_MS / 1000;

export function makeOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (name.length < 1 || name.length > 80) return null;
  if (/[\u0000-\u001f]/.test(name)) return null;
  return name;
}

export function shareToken(): string {
  return randomBytes(24).toString("base64url");
}
