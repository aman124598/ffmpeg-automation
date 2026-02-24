import path from "node:path";

import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VIDEO_EXTENSIONS,
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_LOGO_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES
} from "../constants.js";
import { AppError } from "../errors.js";
import type { UploadedFileLike } from "../types.js";

function normalizedExtension(fileName: string): string {
  return path.extname(fileName).toLowerCase();
}

function isAllowedExtension(fileName: string, allowed: readonly string[]): boolean {
  return allowed.includes(normalizedExtension(fileName));
}

function isAllowedMimeType(mimeType: string, allowed: readonly string[]): boolean {
  return allowed.includes(mimeType.toLowerCase());
}

export function validateVideoFile(file: UploadedFileLike): void {
  if (!isAllowedExtension(file.originalname, ALLOWED_VIDEO_EXTENSIONS)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Unsupported video format. Allowed: .mp4, .mov, .mkv, .avi",
      400
    );
  }

  if (!isAllowedMimeType(file.mimetype, ALLOWED_VIDEO_MIME_TYPES)) {
    throw new AppError("VALIDATION_ERROR", "Unsupported video MIME type.", 400);
  }

  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    throw new AppError("PAYLOAD_TOO_LARGE", "Video file exceeds 1GB size limit.", 413);
  }
}

export function validateLogoFile(file: UploadedFileLike): void {
  if (!isAllowedExtension(file.originalname, ALLOWED_IMAGE_EXTENSIONS)) {
    throw new AppError("VALIDATION_ERROR", "Unsupported logo format. Allowed: .png, .jpg, .jpeg", 400);
  }

  if (!isAllowedMimeType(file.mimetype, ALLOWED_IMAGE_MIME_TYPES)) {
    throw new AppError("VALIDATION_ERROR", "Unsupported image MIME type.", 400);
  }

  if (file.size > MAX_LOGO_SIZE_BYTES) {
    throw new AppError("PAYLOAD_TOO_LARGE", "Logo file exceeds 20MB size limit.", 413);
  }
}
