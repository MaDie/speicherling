import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  hashSecret,
  newSessionId,
  sessionExpiry,
  shareToken,
} from "./crypto.js";
import type { Config } from "./config.js";
import { ensureUserRoot } from "./files.js";

export type UserRole = "admin" | "user";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string | null;
  role: UserRole;
  created_at: number;
};

export type SessionRow = {
  id: string;
  user_id: string;
  expires_at: number;
};

export type OtpRow = {
  id: string;
  email: string;
  code_hash: string;
  expires_at: number;
  created_at: number;
};

export type ShareRow = {
  id: string;
  user_id: string;
  path: string;
  token: string;
  kind: "file" | "folder";
  created_at: number;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export function toPublicUser(user: UserRow): PublicUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export function openDatabase(file: string): Database.Database {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otp_attempts (
      email TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK (kind IN ('file', 'folder')),
      created_at INTEGER NOT NULL,
      UNIQUE (user_id, path)
    );
  `);
  return db;
}

export function countUsers(db: Database.Database): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  return row.n;
}

export async function ensureAdmin(db: Database.Database, config: Config): Promise<void> {
  if (countUsers(db) > 0) return;
  const passwordHash =
    config.authMode === "password" && config.adminPassword
      ? await hashSecret(config.adminPassword)
      : null;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, role, created_at)
     VALUES (?, ?, ?, ?, 'admin', ?)`,
  ).run(id, config.adminEmail, "Admin", passwordHash, Date.now());
  ensureUserRoot(config.dataDir, id);
}

export function getUserByEmail(db: Database.Database, email: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
}

export function getUserById(db: Database.Database, id: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function listUsers(db: Database.Database): PublicUser[] {
  const rows = db
    .prepare("SELECT * FROM users ORDER BY created_at ASC")
    .all() as UserRow[];
  return rows.map(toPublicUser);
}

export async function insertUser(
  db: Database.Database,
  config: Config,
  input: { email: string; name: string; password: string | null },
): Promise<PublicUser> {
  const id = randomUUID();
  const passwordHash = input.password ? await hashSecret(input.password) : null;
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, role, created_at)
     VALUES (?, ?, ?, ?, 'user', ?)`,
  ).run(id, input.email, input.name, passwordHash, Date.now());
  ensureUserRoot(config.dataDir, id);
  const user = getUserById(db, id);
  if (!user) throw new Error("user missing after insert");
  return toPublicUser(user);
}

export function updatePassword(db: Database.Database, userId: string, passwordHash: string) {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
}

export function createSession(db: Database.Database, userId: string): string {
  const id = newSessionId();
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(
    id,
    userId,
    sessionExpiry(),
  );
  return id;
}

export function getSession(db: Database.Database, id: string): SessionRow | undefined {
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
  if (!row) return undefined;
  if (row.expires_at <= Date.now()) {
    deleteSession(db, id);
    return undefined;
  }
  return row;
}

export function deleteSession(db: Database.Database, id: string) {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

export function countOtpAttempts(db: Database.Database, email: string, since: number): number {
  db.prepare("DELETE FROM otp_attempts WHERE created_at < ?").run(since - 24 * 60 * 60 * 1000);
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM otp_attempts WHERE email = ? AND created_at > ?")
    .get(email, since) as { n: number };
  return row.n;
}

export function insertOtpAttempt(db: Database.Database, email: string, now: number) {
  db.prepare("INSERT INTO otp_attempts (email, created_at) VALUES (?, ?)").run(email, now);
}

export function replaceOtpCode(
  db: Database.Database,
  email: string,
  codeHash: string,
  now: number,
  expiresAt: number,
) {
  db.prepare("DELETE FROM otp_codes WHERE email = ?").run(email);
  db.prepare(
    "INSERT INTO otp_codes (id, email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(randomUUID(), email, codeHash, expiresAt, now);
}

export function otpCodesFor(db: Database.Database, email: string, now: number): OtpRow[] {
  return db
    .prepare(
      "SELECT * FROM otp_codes WHERE email = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 5",
    )
    .all(email, now) as OtpRow[];
}

export function deleteOtpCodes(db: Database.Database, email: string) {
  db.prepare("DELETE FROM otp_codes WHERE email = ?").run(email);
}

export function sharePaths(db: Database.Database, userId: string): string[] {
  const rows = db.prepare("SELECT path FROM shares WHERE user_id = ?").all(userId) as { path: string }[];
  return rows.map((row) => row.path);
}

export function getShareByPath(
  db: Database.Database,
  userId: string,
  relPath: string,
): ShareRow | undefined {
  return db
    .prepare("SELECT * FROM shares WHERE user_id = ? AND path = ?")
    .get(userId, relPath) as ShareRow | undefined;
}

export function getShareByToken(db: Database.Database, token: string): ShareRow | undefined {
  return db.prepare("SELECT * FROM shares WHERE token = ?").get(token) as ShareRow | undefined;
}

export function createShare(
  db: Database.Database,
  userId: string,
  relPath: string,
  kind: "file" | "folder",
): ShareRow {
  const existing = getShareByPath(db, userId, relPath);
  if (existing) return existing;
  const row: ShareRow = {
    id: randomUUID(),
    user_id: userId,
    path: relPath,
    token: shareToken(),
    kind,
    created_at: Date.now(),
  };
  db.prepare(
    `INSERT INTO shares (id, user_id, path, token, kind, created_at)
     VALUES (@id, @user_id, @path, @token, @kind, @created_at)`,
  ).run(row);
  return row;
}

export function deleteShareByPath(db: Database.Database, userId: string, relPath: string) {
  db.prepare("DELETE FROM shares WHERE user_id = ? AND path = ?").run(userId, relPath);
}

export function deleteSharesUnder(db: Database.Database, userId: string, relPath: string) {
  const rows = db.prepare("SELECT path FROM shares WHERE user_id = ?").all(userId) as { path: string }[];
  const remove = db.prepare("DELETE FROM shares WHERE user_id = ? AND path = ?");
  const prefix = `${relPath}/`;
  for (const row of rows) {
    if (row.path === relPath || row.path.startsWith(prefix)) {
      remove.run(userId, row.path);
    }
  }
}

export function retargetShares(
  db: Database.Database,
  userId: string,
  fromPath: string,
  toPath: string,
) {
  const rows = db.prepare("SELECT path FROM shares WHERE user_id = ?").all(userId) as { path: string }[];
  const prefix = `${fromPath}/`;
  const changes: { from: string; to: string }[] = [];
  for (const row of rows) {
    if (row.path === fromPath) changes.push({ from: row.path, to: toPath });
    else if (row.path.startsWith(prefix)) {
      changes.push({ from: row.path, to: toPath + row.path.slice(fromPath.length) });
    }
  }
  const del = db.prepare("DELETE FROM shares WHERE user_id = ? AND path = ?");
  const update = db.prepare("UPDATE shares SET path = ? WHERE user_id = ? AND path = ?");
  const tx = db.transaction(() => {
    for (const change of changes) {
      if (change.from === change.to) continue;
      del.run(userId, change.to);
      update.run(change.to, userId, change.from);
    }
  });
  tx();
}
