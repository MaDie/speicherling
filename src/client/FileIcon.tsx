import type { ReactNode } from "react";

export type FileKind =
  | "folder"
  | "worksheet"
  | "word"
  | "excel"
  | "powerpoint"
  | "pdf"
  | "image"
  | "text"
  | "sheet"
  | "archive"
  | "audio"
  | "video"
  | "code"
  | "file";

const sets: { kind: FileKind; ext: string[] }[] = [
  { kind: "worksheet", ext: ["wscdoc", "abd"] },
  { kind: "word", ext: ["doc", "docx", "docm"] },
  { kind: "excel", ext: ["xls", "xlsx", "xlsm", "xlsb"] },
  { kind: "powerpoint", ext: ["ppt", "pptx", "pps", "ppsx"] },
  { kind: "pdf", ext: ["pdf"] },
  { kind: "image", ext: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "heic", "avif"] },
  { kind: "text", ext: ["txt", "md", "rtf"] },
  { kind: "sheet", ext: ["csv"] },
  { kind: "archive", ext: ["zip", "tar", "gz", "tgz", "7z", "rar"] },
  { kind: "audio", ext: ["mp3", "wav", "flac", "m4a", "ogg", "aac"] },
  { kind: "video", ext: ["mp4", "mov", "webm", "mkv", "avi"] },
  { kind: "code", ext: ["js", "ts", "tsx", "jsx", "py", "json", "html", "css", "go", "rs", "java", "c", "cpp", "sh", "yml", "yaml"] },
];

export function fileKind(name: string, folder: boolean): FileKind {
  if (folder) return "folder";
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  return sets.find((entry) => entry.ext.includes(ext))?.kind ?? "file";
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="file-icon" viewBox="0 0 32 32" aria-hidden="true">
      {children}
    </svg>
  );
}

function Page({ color, mark }: { color: string; mark?: ReactNode }) {
  return (
    <Icon>
      <path d="M8 3h11l6 6v18a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill={color} />
      <path d="M19 3v6h6" fill="rgba(255,255,255,.55)" />
      {mark}
    </Icon>
  );
}

function Letter({ value, size = 11 }: { value: string; size?: number }) {
  return (
    <text x="15" y="23" textAnchor="middle" fontSize={size} fontFamily="Arial, sans-serif" fontWeight="700" fill="white">
      {value}
    </text>
  );
}

export function FileIcon({ name, folder }: { name: string; folder: boolean }) {
  const kind = fileKind(name, folder);
  if (kind === "folder") {
    return (
      <Icon>
        <path d="M3 11a2 2 0 0 1 2-2h6l2 2h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V11z" fill="#e0b15a" />
        <path d="M3 14h26v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V14z" fill="#f0c56e" />
      </Icon>
    );
  }
  if (kind === "worksheet") {
    return (
      <Page
        color="#e39b2b"
        mark={
          <g stroke="white" strokeWidth="1.4" strokeLinecap="round">
            <path d="M10 16h10" />
            <path d="M10 19.5h10" />
            <path d="M10 23h7" />
          </g>
        }
      />
    );
  }
  if (kind === "word") return <Page color="#2b579a" mark={<Letter value="W" />} />;
  if (kind === "excel") return <Page color="#217346" mark={<Letter value="X" />} />;
  if (kind === "powerpoint") return <Page color="#d04423" mark={<Letter value="P" />} />;
  if (kind === "pdf") return <Page color="#c44536" mark={<Letter value="PDF" size={7} />} />;
  if (kind === "image") {
    return (
      <Page
        color="#3d7ea6"
        mark={
          <g>
            <circle cx="12" cy="16" r="1.6" fill="white" />
            <path d="M9 24l4-4 3 2 4-5 3 7H9z" fill="white" />
          </g>
        }
      />
    );
  }
  if (kind === "text") {
    return (
      <Page
        color="#6d7a86"
        mark={
          <g stroke="white" strokeWidth="1.4" strokeLinecap="round">
            <path d="M10 16h10" />
            <path d="M10 20h10" />
            <path d="M10 24h6" />
          </g>
        }
      />
    );
  }
  if (kind === "sheet") {
    return (
      <Page
        color="#3f8f78"
        mark={
          <g stroke="white" strokeWidth="1.2">
            <path d="M10 15h12M10 19h12M10 23h12M14 14v10M18 14v10" />
          </g>
        }
      />
    );
  }
  if (kind === "archive") {
    return (
      <Page
        color="#8a6a3b"
        mark={
          <g fill="white">
            <rect x="14" y="14" width="4" height="2" />
            <rect x="14" y="18" width="4" height="2" />
            <rect x="14" y="22" width="4" height="2" />
          </g>
        }
      />
    );
  }
  if (kind === "audio") {
    return (
      <Page
        color="#7a5ea7"
        mark={
          <g fill="white">
            <circle cx="12" cy="23" r="2" />
            <path d="M14 23V14l7-2v9" />
            <circle cx="19" cy="21" r="2" />
          </g>
        }
      />
    );
  }
  if (kind === "video") {
    return (
      <Page
        color="#355c7d"
        mark={<path d="M12 16l8 4-8 4V16z" fill="white" />}
      />
    );
  }
  if (kind === "code") return <Page color="#3c6e71" mark={<Letter value="</>" size={8} />} />;
  return <Page color="#b7b1a6" />;
}
