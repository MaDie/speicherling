import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { ApiError, api, errorText, uploadForm } from "./api";
import { FileIcon } from "./FileIcon";
import { useI18n } from "./i18n";
import { Preview, type PreviewFile } from "./Preview";
import { useLocation } from "./route";

type Entry = {
  name: string;
  kind: "file" | "folder";
  size: number;
  shared: boolean;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function childPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

type UploadJob = { dir: string; files: File[] };

function fileBytes(files: File[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

async function uploadFiles(
  dir: string,
  files: File[],
  onChunk: (loaded: number) => void,
) {
  if (files.length === 0) return;
  const body = new FormData();
  body.append("path", dir);
  for (const file of files) body.append("files", file, file.name);
  const bytes = fileBytes(files);
  await uploadForm("/api/upload", body, (loaded, total) => {
    const ratio = total > 0 ? loaded / total : 1;
    onChunk(Math.min(bytes, Math.round(bytes * ratio)));
  });
}

async function ensureFolder(parent: string, name: string) {
  try {
    await api("/api/folders", {
      method: "POST",
      body: JSON.stringify({ path: parent, name }),
    });
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "already_exists") throw error;
  }
}

async function collectEntry(entry: FileSystemEntry, parent: string, jobs: UploadJob[]) {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    jobs.push({ dir: parent, files: [file] });
    return;
  }
  const directory = entry as FileSystemDirectoryEntry;
  await ensureFolder(parent, directory.name);
  const next = childPath(parent, directory.name);
  const children = await readEntries(directory.createReader());
  const files: File[] = [];
  for (const child of children) {
    if (child.isFile) {
      files.push(
        await new Promise<File>((resolve, reject) => {
          (child as FileSystemFileEntry).file(resolve, reject);
        }),
      );
    } else {
      await collectEntry(child, next, jobs);
    }
  }
  if (files.length > 0) jobs.push({ dir: next, files });
}

async function runJobs(jobs: UploadJob[], onProgress: (loaded: number, total: number) => void) {
  const total = jobs.reduce((sum, job) => sum + fileBytes(job.files), 0);
  let sent = 0;
  onProgress(0, total);
  for (const job of jobs) {
    for (let index = 0; index < job.files.length; index += 20) {
      const slice = job.files.slice(index, index + 20);
      const sliceBytes = fileBytes(slice);
      await uploadFiles(job.dir, slice, (loaded) => onProgress(sent + loaded, total));
      sent += sliceBytes;
      onProgress(sent, total);
    }
  }
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const read = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all);
        else {
          all.push(...batch);
          read();
        }
      }, reject);
    };
    read();
  });
}

export function Files() {
  const { t } = useI18n();
  const { search, navigate } = useLocation();
  const dir = new URLSearchParams(search).get("path") ?? "";
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [makingFolder, setMakingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [sharePath, setSharePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewFile | null>(null);

  function openDir(next: string) {
    setPreview(null);
    const params = new URLSearchParams();
    if (next) params.set("path", next);
    const query = params.toString();
    navigate(query ? `/?${query}` : "/");
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ entries: Entry[] }>(`/api/files?path=${encodeURIComponent(dir)}`);
      setEntries(result.entries);
    } catch (reason) {
      setError(errorText(t, reason instanceof ApiError ? reason.code : "server_error"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Reload when the folder or the language of error text changes.
  }, [dir, t]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (reason) {
      setError(errorText(t, reason instanceof ApiError ? reason.code : "server_error"));
    } finally {
      setBusy(false);
    }
  }

  async function uploadAll(jobs: UploadJob[]) {
    setBusy(true);
    setProgress(0);
    setError(null);
    try {
      await runJobs(jobs, (loaded, total) => {
        const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
        setProgress(percent);
      });
      await load();
    } catch (reason) {
      setError(errorText(t, reason instanceof ApiError ? reason.code : "server_error"));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function onDrop(event: DragEvent) {
    const items = [...event.dataTransfer.items];
    const entriesFromItems = items
      .map((item) => item.webkitGetAsEntry?.())
      .filter((entry): entry is FileSystemEntry => Boolean(entry));
    if (entriesFromItems.length > 0) {
      const jobs: UploadJob[] = [];
      for (const entry of entriesFromItems) await collectEntry(entry, dir, jobs);
      await uploadAll(jobs);
      return;
    }
    await uploadAll([{ dir, files: [...event.dataTransfer.files] }]);
  }

  async function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    await uploadAll([{ dir, files: [...files] }]);
  }

  function createFolder(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api("/api/folders", {
        method: "POST",
        body: JSON.stringify({ path: dir, name: folderName }),
      });
      setFolderName("");
      setMakingFolder(false);
    });
  }

  const crumbs = dir ? dir.split("/") : [];

  return (
    <section
      className={drag ? "sheet files-layout drag" : "sheet files-layout"}
      onDragOver={(event) => {
        event.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDrag(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDrag(false);
        void onDrop(event);
      }}
    >
      <div className="files-main">
      <div className="toolbar">
        <nav className="crumbs" aria-label={t("files")}>
          <button type="button" onClick={() => openDir("")}>
            Speicherling
          </button>
          {crumbs.map((crumb, index) => {
            const next = crumbs.slice(0, index + 1).join("/");
            return (
              <span key={next}>
                <span className="sep">/</span>
                <button type="button" onClick={() => openDir(next)}>
                  {crumb}
                </button>
              </span>
            );
          })}
        </nav>
        <div className="toolbar-actions">
          <button type="button" className="ghost" onClick={() => setMakingFolder((value) => !value)}>
            {t("newFolder")}
          </button>
          <label className="ghost file-pick" htmlFor="file-upload">
            {t("upload")}
          </label>
          <input
            id="file-upload"
            className="file-input"
            type="file"
            multiple
            onChange={(event) => {
              void onPick(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      </div>
      {makingFolder ? (
        <form className="inline-form" onSubmit={createFolder}>
          <input
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            placeholder={t("folderName")}
            aria-label={t("folderName")}
            required
          />
          <button className="primary" type="submit" disabled={busy}>
            {t("create")}
          </button>
        </form>
      ) : null}
      <label htmlFor="file-upload" className={drag ? "drop active" : "drop"}>
        {progress !== null ? (
          <div className="progress">
            <div className="progress-track">
              <div className="progress-bar" style={{ width: `${progress}%` }} />
            </div>
            <span>{t("uploading", { percent: String(progress) })}</span>
          </div>
        ) : (
          t("dropHint")
        )}
      </label>
      {error ? <p className="banner">{error}</p> : null}
      {loading ? <p className="muted">{t("loading")}</p> : null}
      {!loading && entries.length === 0 ? <p className="muted">{t("empty")}</p> : null}
      <ul className="file-list">
        {entries.map((entry) => {
          const full = childPath(dir, entry.name);
          return (
            <li className={preview?.path === full ? "file-row selected" : "file-row"} key={full}>
              <FileIcon name={entry.name} folder={entry.kind === "folder"} />
              <div className="file-name">
                {renaming === full ? (
                  <form
                    className="inline-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(async () => {
                        await api("/api/files", {
                          method: "PATCH",
                          body: JSON.stringify({ path: full, name: renameValue }),
                        });
                        if (preview?.path === full) setPreview({ path: childPath(dir, renameValue), name: renameValue, size: entry.size });
                        setRenaming(null);
                      });
                    }}
                  >
                    <input
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      aria-label={t("rename")}
                      required
                    />
                    <button className="primary" type="submit" disabled={busy}>
                      {t("save")}
                    </button>
                    <button className="ghost" type="button" onClick={() => setRenaming(null)}>
                      {t("cancel")}
                    </button>
                  </form>
                ) : entry.kind === "folder" ? (
                  <button type="button" className="name-button" onClick={() => openDir(full)}>
                    {entry.name}
                  </button>
                ) : (
                  <button type="button" className="name-button" onClick={() => setPreview({ path: full, name: entry.name, size: entry.size })}>
                    {entry.name}
                  </button>
                )}
                {entry.shared ? <span className="badge">{t("sharedBadge")}</span> : null}
              </div>
              <span className="file-meta">{entry.kind === "file" ? formatSize(entry.size) : ""}</span>
              {confirming === full ? (
                <div className="row-actions">
                  <span>{t("confirmDelete")}</span>
                  <button
                    type="button"
                    className="danger"
                    onClick={() =>
                      void run(async () => {
                        await api("/api/files", {
                          method: "DELETE",
                          body: JSON.stringify({ path: full }),
                        });
                        if (preview?.path === full) setPreview(null);
                        setConfirming(null);
                      })
                    }
                  >
                    {t("delete")}
                  </button>
                  <button type="button" className="ghost" onClick={() => setConfirming(null)}>
                    {t("cancel")}
                  </button>
                </div>
              ) : (
                <div className="row-actions">
                  {entry.kind === "file" ? (
                    <a href={`/api/download?path=${encodeURIComponent(full)}`}>{t("download")}</a>
                  ) : (
                    <a href={`/api/zip?path=${encodeURIComponent(full)}`}>{t("zip")}</a>
                  )}
                  <button type="button" onClick={() => setSharePath(full)}>
                    {t("share")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRenaming(full);
                      setRenameValue(entry.name);
                    }}
                  >
                    {t("rename")}
                  </button>
                  <button type="button" className="danger" onClick={() => setConfirming(full)}>
                    {t("delete")}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {sharePath ? (
        <ShareDialog
          path={sharePath}
          onClose={() => setSharePath(null)}
          onChanged={() => void load()}
        />
      ) : null}
      </div>
      <Preview file={preview} onClose={() => setPreview(null)} />
    </section>
  );
}

function ShareDialog({
  path,
  onClose,
  onChanged,
}: {
  path: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ url: string }>("/api/shares", {
      method: "POST",
      body: JSON.stringify({ path }),
    })
      .then((result) => setUrl(result.url))
      .catch((reason: unknown) => {
        setError(errorText(t, reason instanceof ApiError ? reason.code : "server_error"));
      });
  }, [path, t]);

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-labelledby="share-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="share-title">{t("shareTitle")}</h2>
        <p className="lede">{t("shareHint")}</p>
        {error ? <p className="banner">{error}</p> : null}
        <input readOnly value={url} aria-label={t("shareTitle")} onFocus={(event) => event.target.select()} />
        {copied ? <p className="note">{t("linkCopied")}</p> : null}
        <div className="dialog-actions">
          <button
            type="button"
            className="primary"
            disabled={!url}
            onClick={() => {
              void navigator.clipboard.writeText(url).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
          >
            {t("copyLink")}
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              void api("/api/shares", { method: "DELETE", body: JSON.stringify({ path }) }).then(() => {
                onChanged();
                onClose();
              });
            }}
          >
            {t("removeLink")}
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
