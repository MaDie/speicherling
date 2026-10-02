import { useEffect, useState } from "react";
import { renderAsync } from "docx-preview";
import readXlsxFile from "read-excel-file/browser";
import { previewMaxBytes, previewKind } from "./previewKind";
import { useI18n } from "./i18n";

export type PreviewFile = {
  path: string;
  name: string;
  size: number;
};

const maxRows = 400;
const maxCols = 40;

function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toLocaleString();
  return String(value);
}

function previewUrl(path: string): string {
  return `/api/download?path=${encodeURIComponent(path)}&inline=1`;
}

export function Preview({ file, onClose }: { file: PreviewFile | null; onClose: () => void }) {
  const { t } = useI18n();
  const kind = file ? previewKind(file.name) : null;
  const tooLarge = file ? file.size > previewMaxBytes : false;

  return (
    <aside className={file ? "preview-pane open" : "preview-pane"} aria-label={t("preview")}>
      <div className="preview-head">
        <h2>{file ? file.name : t("preview")}</h2>
        {file ? (
          <button type="button" className="ghost" onClick={onClose}>
            {t("close")}
          </button>
        ) : null}
      </div>
      {!file ? <p className="muted">{t("previewEmpty")}</p> : null}
      {file && !kind ? <p className="muted">{t("previewUnsupported")}</p> : null}
      {file && kind && tooLarge ? <p className="muted">{t("previewTooLarge")}</p> : null}
      {file && kind === "pdf" && !tooLarge ? (
        <iframe className="preview-frame" title={file.name} src={previewUrl(file.path)} />
      ) : null}
      {file && kind === "image" && !tooLarge ? <ImagePreview key={file.path} path={file.path} name={file.name} /> : null}
      {file && kind === "text" && !tooLarge ? <TextPreview key={file.path} path={file.path} /> : null}
      {file && kind === "audio" && !tooLarge ? (
        <audio key={file.path} className="preview-media" controls src={previewUrl(file.path)} />
      ) : null}
      {file && kind === "video" && !tooLarge ? (
        <video key={file.path} className="preview-media" controls src={previewUrl(file.path)} />
      ) : null}
      {file && kind === "docx" && !tooLarge ? <DocxPreview path={file.path} /> : null}
      {file && kind === "sheet" && !tooLarge ? <SheetPreview path={file.path} /> : null}
    </aside>
  );
}

function ImagePreview({ path, name }: { path: string; name: string }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="muted">{t("previewFailed")}</p>;
  return <img className="preview-image" alt={name} src={previewUrl(path)} onError={() => setFailed(true)} />;
}

function TextPreview({ path }: { path: string }) {
  const { t } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setFailed(false);
    setTruncated(false);
    void fetch(previewUrl(path))
      .then(async (response) => {
        if (!response.ok) throw new Error("preview");
        return response.text();
      })
      .then((body) => {
        if (cancelled) return;
        const limit = 200_000;
        setTruncated(body.length > limit);
        setText(body.slice(0, limit));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (failed) return <p className="muted">{t("previewFailed")}</p>;
  if (text === null) return <p className="muted">{t("loading")}</p>;
  return (
    <div className="preview-body">
      {truncated ? <p className="muted">{t("previewTruncated")}</p> : null}
      <pre className="preview-text">{text}</pre>
    </div>
  );
}

function DocxPreview({ path }: { path: string }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const [node, setNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!node) return;
    let cancelled = false;
    setFailed(false);
    node.replaceChildren();
    void fetch(previewUrl(path))
      .then(async (response) => {
        if (!response.ok) throw new Error("preview");
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        return renderAsync(blob, node, node, { inWrapper: true, ignoreWidth: true });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [path, node]);

  return (
    <div className="preview-body">
      {failed ? <p className="muted">{t("previewFailed")}</p> : null}
      <div ref={setNode} />
    </div>
  );
}

function SheetPreview({ path }: { path: string }) {
  const { t } = useI18n();
  const [sheets, setSheets] = useState<{ name: string; rows: string[][] }[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSheets(null);
    setFailed(false);
    setTruncated(false);
    setActive(0);
    void fetch(previewUrl(path))
      .then(async (response) => {
        if (!response.ok) throw new Error("preview");
        return response.arrayBuffer();
      })
      .then((buffer) => readXlsxFile(buffer))
      .then((parsed) => {
        if (cancelled) return;
        let cut = false;
        const next = parsed.map((sheet) => {
          const rows = sheet.data.slice(0, maxRows).map((row) => {
            if (row.length > maxCols) cut = true;
            return row.slice(0, maxCols).map(cellText);
          });
          if (sheet.data.length > maxRows) cut = true;
          return { name: sheet.sheet, rows };
        });
        setTruncated(cut);
        setSheets(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (failed) return <p className="muted">{t("previewFailed")}</p>;
  if (!sheets) return <p className="muted">{t("loading")}</p>;
  const sheet = sheets[active] ?? sheets[0];
  if (!sheet) return <p className="muted">{t("previewFailed")}</p>;

  return (
    <div className="preview-body">
      {sheets.length > 1 ? (
        <div className="sheet-tabs">
          {sheets.map((item, index) => (
            <button
              key={item.name}
              type="button"
              aria-pressed={index === active}
              onClick={() => setActive(index)}
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}
      {truncated ? <p className="muted">{t("previewTruncated")}</p> : null}
      <div className="preview-table-wrap">
        <table className="preview-table">
          <tbody>
            {sheet.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
