import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export type AuthMode = "otp" | "password";

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

export type Config = {
  dataDir: string;
  authMode: AuthMode;
  adminEmail: string;
  adminPassword: string | null;
  sessionSecret: string;
  publicUrl: string;
  smtp: SmtpConfig | null;
  maxUploadMb: number;
  port: number;
  secureCookie: boolean;
};

function loadEnvFile(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

export function loadConfig(): Config {
  loadEnvFile(path.resolve(".env"));

  const authMode = process.env.AUTH_MODE;
  if (authMode !== "otp" && authMode !== "password") {
    fail("AUTH_MODE muss otp oder password sein.");
  }

  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    fail("ADMIN_EMAIL fehlt oder ist ungültig.");
  }

  const sessionSecret = process.env.SESSION_SECRET ?? "";
  if (sessionSecret.length < 16) {
    fail("SESSION_SECRET muss mindestens 16 Zeichen lang sein.");
  }

  const publicUrl = (process.env.PUBLIC_URL ?? "").replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(publicUrl);
  } catch {
    fail("PUBLIC_URL muss eine gültige Adresse sein, zum Beispiel https://stick.example.com.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    fail("PUBLIC_URL muss mit http:// oder https:// beginnen.");
  }

  const adminPassword = process.env.ADMIN_PASSWORD ?? "";
  if (authMode === "password" && adminPassword.length < 8) {
    fail("Bei AUTH_MODE=password braucht ADMIN_PASSWORD mindestens 8 Zeichen.");
  }

  const smtpHost = (process.env.SMTP_HOST ?? "").trim();
  const smtpFrom = (process.env.SMTP_FROM ?? "").trim();
  if (authMode === "otp" && (!smtpHost || !smtpFrom)) {
    fail("Bei AUTH_MODE=otp sind SMTP_HOST und SMTP_FROM Pflicht.");
  }

  const smtpPort = Number(process.env.SMTP_PORT ?? "587");
  if (authMode === "otp" && !Number.isInteger(smtpPort)) {
    fail("SMTP_PORT muss eine ganze Zahl sein.");
  }

  const maxUploadMb = Number(process.env.MAX_UPLOAD_MB ?? "200");
  if (!Number.isFinite(maxUploadMb) || maxUploadMb <= 0) {
    fail("MAX_UPLOAD_MB muss eine positive Zahl sein.");
  }

  const port = Number(process.env.PORT ?? "8080");
  if (!Number.isInteger(port) || port <= 0) {
    fail("PORT muss eine ganze Zahl sein.");
  }

  const dataDir = path.resolve(process.env.DATA_DIR ?? "data");
  mkdirSync(path.join(dataDir, "files"), { recursive: true });

  return {
    dataDir,
    authMode,
    adminEmail,
    adminPassword: authMode === "password" ? adminPassword : null,
    sessionSecret,
    publicUrl,
    smtp:
      authMode === "otp"
        ? {
            host: smtpHost,
            port: smtpPort,
            user: process.env.SMTP_USER ?? "",
            pass: process.env.SMTP_PASS ?? "",
            from: smtpFrom,
          }
        : null,
    maxUploadMb,
    port,
    secureCookie: parsed.protocol === "https:",
  };
}
