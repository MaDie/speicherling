import "@fastify/cookie";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "./config.js";
import {
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  OTP_WINDOW_MS,
  hashSecret,
  makeOtpCode,
  normalizeEmail,
  normalizeName,
  sessionMaxAgeSec,
  verifySecret,
} from "./crypto.js";
import type { Database } from "better-sqlite3";
import {
  countOtpAttempts,
  createSession,
  deleteOtpCodes,
  deleteSession,
  getSession,
  getUserByEmail,
  getUserById,
  insertOtpAttempt,
  insertUser,
  listUsers,
  otpCodesFor,
  replaceOtpCode,
  toPublicUser,
  updatePassword,
  type UserRow,
} from "./db.js";
import { sendLoginCode } from "./mail.js";

export const SESSION_COOKIE = "speicherling";

export type AppCtx = {
  db: Database;
  config: Config;
  dummyHash: string;
};

type AuthBody = {
  email?: unknown;
  password?: unknown;
  code?: unknown;
  lang?: unknown;
  name?: unknown;
  current?: unknown;
  next?: unknown;
};

function readBody(req: FastifyRequest): AuthBody {
  return (req.body ?? {}) as AuthBody;
}

export function readUser(ctx: AppCtx, req: FastifyRequest): UserRow | undefined {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return undefined;
  const session = getSession(ctx.db, token);
  if (!session) return undefined;
  return getUserById(ctx.db, session.user_id);
}

export function requireUser(ctx: AppCtx, req: FastifyRequest, reply: FastifyReply): UserRow | null {
  const user = readUser(ctx, req);
  if (!user) {
    reply.code(401).send({ error: "unauthorized" });
    return null;
  }
  return user;
}

function denyMode(ctx: AppCtx, reply: FastifyReply, mode: Config["authMode"]): boolean {
  if (ctx.config.authMode !== mode) {
    reply.code(404).send({ error: "not_found" });
    return true;
  }
  return false;
}

function setSession(reply: FastifyReply, ctx: AppCtx, userId: string) {
  const id = createSession(ctx.db, userId);
  reply.setCookie(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: ctx.config.secureCookie,
    maxAge: sessionMaxAgeSec,
  });
}

function clearSession(reply: FastifyReply, ctx: AppCtx, token: string | undefined) {
  if (token) deleteSession(ctx.db, token);
  reply.clearCookie(SESSION_COOKIE, { path: "/", secure: ctx.config.secureCookie });
}

export async function registerAuthRoutes(app: FastifyInstance, ctx: AppCtx) {
  app.get("/api/auth/options", async () => ({ mode: ctx.config.authMode }));

  app.post("/api/auth/login", async (req, reply) => {
    if (denyMode(ctx, reply, "password")) return reply;
    const body = readBody(req);
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) return reply.code(400).send({ error: "missing_fields" });
    const user = getUserByEmail(ctx.db, email);
    const ok = await verifySecret(password, user?.password_hash ?? ctx.dummyHash);
    if (!user?.password_hash || !ok) return reply.code(401).send({ error: "invalid_credentials" });
    setSession(reply, ctx, user.id);
    return { user: toPublicUser(user) };
  });

  app.post("/api/auth/otp/request", async (req, reply) => {
    if (denyMode(ctx, reply, "otp")) return reply;
    const body = readBody(req);
    const email = normalizeEmail(body.email);
    if (!email) return reply.code(400).send({ error: "missing_fields" });
    const now = Date.now();
    if (countOtpAttempts(ctx.db, email, now - OTP_WINDOW_MS) >= OTP_MAX_ATTEMPTS) {
      return reply.code(429).send({ error: "rate_limited" });
    }
    insertOtpAttempt(ctx.db, email, now);
    const user = getUserByEmail(ctx.db, email);
    if (!user) return { ok: true };
    const code = makeOtpCode();
    const codeHash = await hashSecret(code);
    replaceOtpCode(ctx.db, email, codeHash, now, now + OTP_TTL_MS);
    const lang = body.lang === "en" ? "en" : "de";
    try {
      await sendLoginCode(ctx.config, email, code, lang);
    } catch (error) {
      req.log.error(error);
      deleteOtpCodes(ctx.db, email);
      return reply.code(502).send({ error: "mail_failed" });
    }
    return { ok: true };
  });

  app.post("/api/auth/otp/verify", async (req, reply) => {
    if (denyMode(ctx, reply, "otp")) return reply;
    const body = readBody(req);
    const email = normalizeEmail(body.email);
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!email || !/^\d{6}$/.test(code)) return reply.code(401).send({ error: "invalid_code" });
    const user = getUserByEmail(ctx.db, email);
    const rows = otpCodesFor(ctx.db, email, Date.now());
    let match = false;
    for (const row of rows) {
      if (await verifySecret(code, row.code_hash)) match = true;
    }
    if (!user || !match) return reply.code(401).send({ error: "invalid_code" });
    deleteOtpCodes(ctx.db, email);
    setSession(reply, ctx, user.id);
    return { user: toPublicUser(user) };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    clearSession(reply, ctx, req.cookies?.[SESSION_COOKIE]);
    return { ok: true };
  });

  app.get("/api/me", async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return reply;
    return { user: toPublicUser(user), mode: ctx.config.authMode };
  });

  app.post("/api/me/password", async (req, reply) => {
    if (denyMode(ctx, reply, "password")) return reply;
    const user = requireUser(ctx, req, reply);
    if (!user) return reply;
    const body = readBody(req);
    const current = typeof body.current === "string" ? body.current : "";
    const next = typeof body.next === "string" ? body.next : "";
    if (!current || !next) return reply.code(400).send({ error: "missing_fields" });
    if (next.length < 8) return reply.code(400).send({ error: "weak_password" });
    const ok = await verifySecret(current, user.password_hash ?? ctx.dummyHash);
    if (!user.password_hash || !ok) return reply.code(401).send({ error: "invalid_credentials" });
    updatePassword(ctx.db, user.id, await hashSecret(next));
    return { ok: true };
  });

  app.get("/api/admin/users", async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return reply;
    if (user.role !== "admin") return reply.code(403).send({ error: "forbidden" });
    return { users: listUsers(ctx.db) };
  });

  app.post("/api/admin/users", async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return reply;
    if (user.role !== "admin") return reply.code(403).send({ error: "forbidden" });
    const body = readBody(req);
    const email = normalizeEmail(body.email);
    const name = normalizeName(body.name);
    if (!email || !name) return reply.code(400).send({ error: "missing_fields" });
    if (getUserByEmail(ctx.db, email)) return reply.code(409).send({ error: "email_taken" });
    let password: string | null = null;
    if (ctx.config.authMode === "password") {
      password = typeof body.password === "string" ? body.password : "";
      if (password.length < 8) return reply.code(400).send({ error: "weak_password" });
    }
    const created = await insertUser(ctx.db, ctx.config, { email, name, password });
    return reply.code(201).send({ user: created });
  });
}
