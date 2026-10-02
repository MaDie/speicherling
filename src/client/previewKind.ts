export const previewMaxBytes = 50 * 1024 * 1024;

const imageExt = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"];
const textExt = ["txt", "md", "csv", "json", "html", "css", "js", "ts", "tsx", "jsx", "py", "go", "rs", "java", "c", "cpp", "sh", "yml", "yaml"];
const audioExt = ["mp3", "wav", "ogg", "m4a", "aac", "flac"];
const videoExt = ["mp4", "webm", "mov"];

export type PreviewKind = "pdf" | "docx" | "sheet" | "image" | "text" | "audio" | "video";

export function previewKind(name: string): PreviewKind | null {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "xlsx" || ext === "xlsm") return "sheet";
  if (imageExt.includes(ext)) return "image";
  if (textExt.includes(ext)) return "text";
  if (audioExt.includes(ext)) return "audio";
  if (videoExt.includes(ext)) return "video";
  return null;
}
