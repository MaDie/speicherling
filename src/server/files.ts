import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { ZipArchive } from "archiver";

export type DirEntry = {
  name: string;
  kind: "file" | "folder";
  size: number;
};

export function ensureUserRoot(dataDir: string, userId: string): string {
  const dir = path.join(dataDir, "files", userId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function safeBase(name: string): string | null {
  const base = name.trim();
  if (!base || base === "." || base === "..") return null;
  if (base.length > 180) return null;
  if (base.includes("/") || base.includes("\\")) return null;
  if (/[\u0000-\u001f]/.test(base)) return null;
  return base;
}

export function normalizeRel(input: string): string | null {
  const raw = input.replaceAll("\\", "/").trim();
  if (raw === "" || raw === ".") return "";
  if (raw.startsWith("/") || raw.includes("\0")) return null;
  const parts = raw.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) return null;
  if (parts.some((part) => !safeBase(part))) return null;
  const joined = parts.join("/");
  if (joined.length > 1000) return null;
  return joined;
}

export function parentRel(rel: string): string {
  const index = rel.lastIndexOf("/");
  return index === -1 ? "" : rel.slice(0, index);
}

export function joinRel(parent: string, name: string): string | null {
  const base = safeBase(name);
  const dir = normalizeRel(parent);
  if (!base || dir === null) return null;
  return dir ? `${dir}/${base}` : base;
}

function insideRoot(rootReal: string, candidate: string): boolean {
  return candidate === rootReal || candidate.startsWith(rootReal + path.sep);
}

export function resolveInside(root: string, rel: string): string | null {
  const normalized = normalizeRel(rel);
  if (normalized === null || !existsSync(root)) return null;
  const rootReal = realpathSync(root);
  const abs = path.resolve(rootReal, normalized);
  if (!insideRoot(rootReal, abs)) return null;
  if (existsSync(abs)) {
    const real = realpathSync(abs);
    if (!insideRoot(rootReal, real)) return null;
    return real;
  }
  const parent = path.dirname(abs);
  if (!existsSync(parent)) return null;
  const parentReal = realpathSync(parent);
  if (!insideRoot(rootReal, parentReal)) return null;
  return path.join(parentReal, path.basename(abs));
}

export function listDirectory(abs: string): DirEntry[] {
  const entries: DirEntry[] = [];
  for (const item of readdirSync(abs, { withFileTypes: true })) {
    if (!item.isFile() && !item.isDirectory()) continue;
    const full = path.join(abs, item.name);
    const stat = statSync(full);
    entries.push({
      name: item.name,
      kind: item.isDirectory() ? "folder" : "file",
      size: item.isDirectory() ? 0 : stat.size,
    });
  }
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return entries;
}

export type FsResult = "ok" | "invalid" | "missing" | "exists" | "not_a_folder" | "not_a_file";

export function createFolder(root: string, parent: string, name: string): FsResult {
  const rel = joinRel(parent, name);
  if (!rel) return "invalid";
  const parentAbs = resolveInside(root, parent);
  if (!parentAbs || !existsSync(parentAbs) || !statSync(parentAbs).isDirectory()) return "missing";
  const dest = path.join(parentAbs, path.basename(rel));
  if (existsSync(dest)) return "exists";
  mkdirSync(dest);
  return "ok";
}

export function removeEntry(root: string, rel: string): FsResult {
  if (!rel) return "invalid";
  const abs = resolveInside(root, rel);
  if (!abs || !existsSync(abs)) return "missing";
  rmSync(abs, { recursive: true, force: true });
  return "ok";
}

export function renameEntry(root: string, rel: string, nextName: string): FsResult {
  if (!rel) return "invalid";
  const base = safeBase(nextName);
  if (!base) return "invalid";
  const abs = resolveInside(root, rel);
  if (!abs || !existsSync(abs)) return "missing";
  const dest = path.join(path.dirname(abs), base);
  if (existsSync(dest)) return "exists";
  renameSync(abs, dest);
  return "ok";
}

export function openDownload(abs: string) {
  return createReadStream(abs);
}

export function zipDirectory(abs: string, folderName: string) {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.directory(abs, folderName);
  void archive.finalize();
  return archive;
}

export function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\w.\- ]+/g, "_") || "download";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function entryKind(abs: string): "file" | "folder" | null {
  if (!existsSync(abs)) return null;
  return statSync(abs).isDirectory() ? "folder" : statSync(abs).isFile() ? "file" : null;
}
