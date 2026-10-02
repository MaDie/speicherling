import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { hashSecret } from "./crypto.js";
import { loadConfig } from "./config.js";
import { ensureAdmin, openDatabase } from "./db.js";
import { registerAuthRoutes } from "./auth.js";
import { registerFileRoutes, registerShareRoutes } from "./shares.js";

const config = loadConfig();
const version = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")).version as string;
const db = openDatabase(path.join(config.dataDir, "speicherling.db"));
const dummyHash = await hashSecret("speicherling-dummy-password");
await ensureAdmin(db, config);

const app = Fastify({ logger: true });
const maxBytes = Math.floor(config.maxUploadMb * 1024 * 1024);

await app.register(cookie);
await app.register(multipart, {
  limits: { fileSize: maxBytes, files: 40 },
});

app.addHook("onSend", async (req, reply, payload) => {
  if (req.url.startsWith("/api")) reply.header("Cache-Control", "no-store");
  return payload;
});

app.setErrorHandler((error, req, reply) => {
  const code = (error as { code?: string }).code;
  if (code === "FST_REQ_FILE_TOO_LARGE" || code === "FST_FILES_LIMIT") {
    return reply.code(413).send({ error: "too_large" });
  }
  req.log.error(error);
  return reply.code(500).send({ error: "server_error" });
});

const ctx = { db, config, dummyHash };
app.get("/api/version", async () => ({ version }));
await registerAuthRoutes(app, ctx);
registerFileRoutes(app, ctx);
registerShareRoutes(app, ctx);

const clientDir = path.resolve("dist/client");
if (existsSync(path.join(clientDir, "index.html"))) {
  await app.register(fastifyStatic, {
    root: clientDir,
    setHeaders(res, filePath) {
      if (filePath.endsWith(`${path.sep}index.html`)) {
        res.header("Cache-Control", "no-cache");
      }
    },
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api") || (req.method !== "GET" && req.method !== "HEAD")) {
      return reply.code(404).send({ error: "not_found" });
    }
    return reply.sendFile("index.html");
  });
} else {
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api")) return reply.code(404).send({ error: "not_found" });
    return reply.code(404).send({ error: "not_found" });
  });
}

await app.listen({ port: config.port, host: "0.0.0.0" });
app.log.info(`Speicherling ${version} hört auf Port ${config.port} (${config.authMode})`);
