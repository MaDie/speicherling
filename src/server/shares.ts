import { createWriteStream, existsSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance, FastifyReply } from "fastify";
import { requireUser, type AppCtx } from "./auth.js";
import {
  createShare,
  deleteShareByPath,
  deleteSharesUnder,
  getShareByToken,
  retargetShares,
  sharePaths,
} from "./db.js";
import {
  contentDisposition,
  createFolder,
  ensureUserRoot,
  entryKind,
  joinRel,
  listDirectory,
  normalizeRel,
  openDownload,
  parentRel,
  removeEntry,
  renameEntry,
  resolveInside,
  safeBase,
  zipDirectory,
  type FsResult,
} from "./files.js";

function statusFor(result: FsResult): { code: number; error: string } {
  switch (result) {
    case "ok":
      return { code: 200, error: "" };
    case "invalid":
      return { code: 400, error: "invalid_name" };
    case "missing":
      return { code: 404, error: "not_found" };
    case "exists":
      return { code: 409, error: "already_exists" };
    case "not_a_folder":
      return { code: 400, error: "not_a_folder" };
    case "not_a_file":
      return { code: 400, error: "not_a_file" };
  }
}

function fail(reply: FastifyReply, result: FsResult) {
  const mapped = statusFor(result);
  return reply.code(mapped.code).send({ error: mapped.error });
}

function shareUrl(ctx: AppCtx, token: string): string {
  return `${ctx.config.publicUrl}/s/${token}`;
}

type FileBody = { path?: unknown; name?: unknown };

export function registerFileRoutes(app: FastifyInstance, ctx: AppCtx) {
  app.get("/api/files", async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return reply;
    const rel = normalizeRel(String((req.query as { path?: string }).path ?? ""));
    if (rel === null) return reply.code(400).send({ error: "invalid_name" });
    const root = ensureUserRoot(ctx.config.dataDir, user.id);
    const abs = resolveInside(root, rel);
    if (!abs || !existsSync(abs) || !statSync(abs).isDirectory()) {
      return reply.code(404).send({ error: "not_found" });
    }
    const shared = new Set(sharePaths(ctx.db, user.id));
    const entries = listDirectory(abs).map((entry) => {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      return { ...entry, shared: shared.has(child) };
    });
    return { path: rel, entries };
  });

  app.post("/api/folders", async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return reply;
    const body = (req.body ?? {}) as FileBody;
    const parent = normalizeRel(typeof body.path === "string" ? body.path : "");
    const name = typeof body.name === "string" ? body.name : "";
    if (parent === null || !safeBase(name)) return reply.code(400).send({ error: "invalid_name" });
    const root = ensureUserRoot(ctx.config.dataDir, user.id);
    const result = createFolder(root, parent, name);
    if (result !== "ok") return fail(reply, result);
    return { ok: true };
  });

  app.post("/api/upload", async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return reply;
    const root = ensureUserRoot(ctx.config.dataDir, user.id);
    let rel = "";
    let saved = 0;
    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === "file") {
        const base = safeBase(part.filename);
        const dir = resolveInside(root, rel);
        if (!base || !dir || !existsSync(dir) || !statSync(dir).isDirectory()) {
          part.file.resume();
          return reply.code(400).send({ error: "invalid_name" });
        }
        const dest = path.join(dir, base);
        try {
          await pipeline(part.file, createWriteStream(dest));
        } catch (error) {
          rmSync(dest, { force: true });
          throw error;
        }
        if ((part.file as { truncated?: boolean }).truncated) {
          rmSync(dest, { force: true });
          return reply.code(413).send({ error: "too_large" });
        }
        saved += 1;
      } else if (part.fieldname === "path") {
        const next = normalizeRel(String(part.value ?? ""));
        if (next === null) return reply.code(400).send({ error: "invalid_name" });
        rel = next;
      }
    }
    if (saved === 0) return reply.code(400).send({ error: "missing_fields" });
    return { ok: true, saved };
  });

  app.get("/api/download", async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return reply;
    const rel = normalizeRel(String((req.query as { path?: string }).path ?? ""));
    if (!rel) return reply.code(400).send({ error: "invalid_name" });
    const root = ensureUserRoot(ctx.config.dataDir, user.id);
    const abs = resolveInside(root, rel);
    if (!abs || entryKind(abs) !== "file") return reply.code(404).send({ error: "not_found" });
    reply.header("Content-Disposition", contentDisposition(path.basename(abs)));
    reply.type("application/octet-stream");
    return reply.send(openDownload(abs));
  });

  app.get("/api/zip", async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return reply;
    const rel = normalizeRel(String((req.query as { path?: string }).path ?? ""));
    if (!rel) return reply.code(400).send({ error: "invalid_name" });
    const root = ensureUserRoot(ctx.config.dataDir, user.id);
    const abs = resolveInside(root, rel);
    if (!abs || !existsSync(abs)) return reply.code(404).send({ error: "not_found" });
    if (entryKind(abs) !== "folder") return reply.code(400).send({ error: "not_a_folder" });
    const name = path.basename(abs);
    reply.header("Content-Disposition", contentDisposition(`${name}.zip`));
    reply.type("application/zip");
    const archive = zipDirectory(abs, name);
    archive.on("error", (error: unknown) => req.log.error(error));
    return reply.send(archive);
  });

  app.delete("/api/files", async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return reply;
    const body = (req.body ?? {}) as FileBody;
    const rel = normalizeRel(typeof body.path === "string" ? body.path : "");
    if (!rel) return reply.code(400).send({ error: "invalid_name" });
    const root = ensureUserRoot(ctx.config.dataDir, user.id);
    const result = removeEntry(root, rel);
    if (result !== "ok") return fail(reply, result);
    deleteSharesUnder(ctx.db, user.id, rel);
    return { ok: true };
  });

  app.patch("/api/files", async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return reply;
    const body = (req.body ?? {}) as FileBody;
    const rel = normalizeRel(typeof body.path === "string" ? body.path : "");
    const name = typeof body.name === "string" ? body.name : "";
    if (!rel || !safeBase(name)) return reply.code(400).send({ error: "invalid_name" });
    const next = joinRel(parentRel(rel), name);
    if (!next) return reply.code(400).send({ error: "invalid_name" });
    const root = ensureUserRoot(ctx.config.dataDir, user.id);
    const result = renameEntry(root, rel, name);
    if (result !== "ok") return fail(reply, result);
    retargetShares(ctx.db, user.id, rel, next);
    return { ok: true, path: next };
  });
}

function sharedRoot(ctx: AppCtx, token: string) {
  const share = getShareByToken(ctx.db, token);
  if (!share) return null;
  const root = ensureUserRoot(ctx.config.dataDir, share.user_id);
  const abs = resolveInside(root, share.path);
  if (!abs || !existsSync(abs)) return null;
  const kind = entryKind(abs);
  if (kind !== share.kind) return null;
  return { share, abs, kind };
}

function resolveShared(ctx: AppCtx, token: string, rawPath: string) {
  const found = sharedRoot(ctx, token);
  if (!found) return null;
  if (found.kind === "file") {
    if (rawPath) return null;
    return { ...found, rel: "" };
  }
  const rel = normalizeRel(rawPath);
  if (rel === null) return null;
  const abs = resolveInside(found.abs, rel);
  if (!abs || !existsSync(abs)) return null;
  return { ...found, abs, rel };
}

export function registerShareRoutes(app: FastifyInstance, ctx: AppCtx) {
  app.post("/api/shares", async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return reply;
    const body = (req.body ?? {}) as FileBody;
    const rel = normalizeRel(typeof body.path === "string" ? body.path : "");
    if (!rel) return reply.code(400).send({ error: "invalid_name" });
    const root = ensureUserRoot(ctx.config.dataDir, user.id);
    const abs = resolveInside(root, rel);
    const kind = abs ? entryKind(abs) : null;
    if (!abs || !kind) return reply.code(404).send({ error: "not_found" });
    const share = createShare(ctx.db, user.id, rel, kind);
    return { url: shareUrl(ctx, share.token), token: share.token };
  });

  app.delete("/api/shares", async (req, reply) => {
    const user = requireUser(ctx, req, reply);
    if (!user) return reply;
    const body = (req.body ?? {}) as FileBody;
    const rel = normalizeRel(typeof body.path === "string" ? body.path : "");
    if (!rel) return reply.code(400).send({ error: "invalid_name" });
    deleteShareByPath(ctx.db, user.id, rel);
    return { ok: true };
  });

  app.get("/api/s/:token", async (req, reply) => {
    const token = (req.params as { token: string }).token;
    const found = sharedRoot(ctx, token);
    if (!found) return reply.code(404).send({ error: "not_found" });
    return { kind: found.kind, name: path.basename(found.abs) };
  });

  app.get("/api/s/:token/list", async (req, reply) => {
    const token = (req.params as { token: string }).token;
    const raw = String((req.query as { path?: string }).path ?? "");
    const found = resolveShared(ctx, token, raw);
    if (!found || found.kind !== "folder" || entryKind(found.abs) !== "folder") {
      return reply.code(404).send({ error: "not_found" });
    }
    return { path: found.rel, entries: listDirectory(found.abs) };
  });

  app.get("/api/s/:token/download", async (req, reply) => {
    const token = (req.params as { token: string }).token;
    const raw = String((req.query as { path?: string }).path ?? "");
    const found = resolveShared(ctx, token, raw);
    if (!found) return reply.code(404).send({ error: "not_found" });
    const target = found.kind === "file" ? found.abs : found.abs;
    if (entryKind(target) !== "file") return reply.code(400).send({ error: "not_a_file" });
    reply.header("Content-Disposition", contentDisposition(path.basename(target)));
    reply.type("application/octet-stream");
    return reply.send(openDownload(target));
  });

  app.get("/api/s/:token/zip", async (req, reply) => {
    const token = (req.params as { token: string }).token;
    const raw = String((req.query as { path?: string }).path ?? "");
    const found = resolveShared(ctx, token, raw);
    if (!found || found.kind !== "folder") return reply.code(404).send({ error: "not_found" });
    if (entryKind(found.abs) !== "folder") return reply.code(400).send({ error: "not_a_folder" });
    const name = path.basename(found.abs);
    reply.header("Content-Disposition", contentDisposition(`${name}.zip`));
    reply.type("application/zip");
    const archive = zipDirectory(found.abs, name);
    archive.on("error", (error: unknown) => req.log.error(error));
    return reply.send(archive);
  });
}
