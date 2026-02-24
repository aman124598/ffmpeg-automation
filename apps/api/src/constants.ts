import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".mkv", ".avi"] as const;
export const ALLOWED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg"] as const;

export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/x-msvideo",
  "application/octet-stream"
] as const;

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "application/octet-stream"
] as const;

export const MAX_VIDEO_SIZE_BYTES = 1024 * 1024 * 1024;
export const MAX_LOGO_SIZE_BYTES = 20 * 1024 * 1024;
export const PROCESS_TIMEOUT_MS = 2 * 60 * 60 * 1000;
export const MAX_TERMINAL_JOBS = 200;

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const API_ROOT_DIR = path.resolve(currentDir, "..");
export const STORAGE_DIR = path.join(API_ROOT_DIR, "storage");
export const UPLOADS_DIR = path.join(STORAGE_DIR, "uploads");
export const OUTPUTS_DIR = path.join(STORAGE_DIR, "outputs");

export const DEFAULT_DEV_ORIGIN = "http://localhost:5173";
