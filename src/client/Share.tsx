import { useEffect, useState } from "react";
import { ApiError, api, errorText } from "./api";
import { FileIcon } from "./FileIcon";
import { useI18n } from "./i18n";
import { useLocation } from "./route";

type Entry = {
  name: string;
  kind: "file" | "folder";
  size: number;
};

type Meta = {
  kind: "file" | "folder";
  name: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function SharePage({ token }: { token: string }) {
  const { t } = useI18n();
  const { search, navigate, pathname } = useLocation();
  const dir = new URLSearchParams(search).get("path") ?? "";
  const [meta, setMeta] = useState<Meta | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function openDir(next: string) {
    const params = new URLSearchParams();
    if (next) params.set("path", next);
    const query = params.toString();
    navigate(query ? `${pathname}?${query}` : pathname);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<Meta>(`/api/s/${encodeURIComponent(token)}`)
      .then(async (info) => {
        if (cancelled) return;
        setMeta(info);
        if (info.kind === "folder") {
          const list = await api<{ entries: Entry[] }>(
            `/api/s/${encodeURIComponent(token)}/list?path=${encodeURIComponent(dir)}`,
          );
          if (!cancelled) setEntries(list.entries);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorText(t, reason instanceof ApiError ? reason.code : "server_error"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, dir, t]);

  if (loading) return <p className="muted center-note">{t("loading")}</p>;
  if (error || !meta) return <p className="banner center-note">{error ?? t("missingShare")}</p>;

  if (meta.kind === "file") {
    return (
      <section className="card share-card">
        <FileIcon name={meta.name} folder={false} />
        <h1>{meta.name}</h1>
        <p className="lede">{t("sharedFile")}</p>
        <a className="primary link-button" href={`/api/s/${encodeURIComponent(token)}/download`}>
          {t("download")}
        </a>
      </section>
    );
  }

  const crumbs = dir ? dir.split("/") : [];

  return (
    <section className="sheet">
      <div className="toolbar">
        <nav className="crumbs">
          <button type="button" onClick={() => openDir("")}>
            {meta.name}
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
        <a className="ghost link-button" href={`/api/s/${encodeURIComponent(token)}/zip?path=${encodeURIComponent(dir)}`}>
          {t("zip")}
        </a>
      </div>
      <p className="lede">{t("sharedFolder")}</p>
      {entries.length === 0 ? <p className="muted">{t("empty")}</p> : null}
      <ul className="file-list">
        {entries.map((entry) => {
          const full = dir ? `${dir}/${entry.name}` : entry.name;
          return (
            <li className="file-row" key={full}>
              <FileIcon name={entry.name} folder={entry.kind === "folder"} />
              <div className="file-name">
                {entry.kind === "folder" ? (
                  <button type="button" className="name-button" onClick={() => openDir(full)}>
                    {entry.name}
                  </button>
                ) : (
                  <span>{entry.name}</span>
                )}
              </div>
              <span className="file-meta">{entry.kind === "file" ? formatSize(entry.size) : ""}</span>
              <div className="row-actions">
                {entry.kind === "file" ? (
                  <a href={`/api/s/${encodeURIComponent(token)}/download?path=${encodeURIComponent(full)}`}>
                    {t("download")}
                  </a>
                ) : (
                  <a href={`/api/s/${encodeURIComponent(token)}/zip?path=${encodeURIComponent(full)}`}>{t("zip")}</a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
