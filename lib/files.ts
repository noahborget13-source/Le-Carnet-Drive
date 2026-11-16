import type { FileRow } from "./supabase";

export type Kind = "image" | "pdf" | "video" | "audio" | "text" | "other";

const TEXT_EXT = new Set([
  "txt", "md", "csv", "json", "log", "xml", "yml", "yaml", "js", "ts", "tsx",
  "jsx", "css", "html", "py", "sql", "sh", "ini", "toml",
]);

export function kindOf(f: Pick<FileRow, "name" | "mime_type">): Kind {
  const mime = f.mime_type ?? "";
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("text/") || mime === "application/json" || TEXT_EXT.has(ext)) return "text";
  return "other";
}

export const KIND_ICON: Record<Kind, string> = {
  image: "🖼️",
  pdf: "📕",
  video: "🎬",
  audio: "🎵",
  text: "📄",
  other: "📦",
};

// Les clés de stockage n'acceptent pas tous les caractères : on garde le nom d'origine en base
export function safeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(-120);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ["Ko", "Mo", "Go"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
