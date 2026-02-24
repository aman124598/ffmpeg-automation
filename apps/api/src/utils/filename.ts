import path from "node:path";

import { fileExists } from "./fs.js";

const SAFE_FILE_CHARS = /[^A-Za-z0-9._-]/g;

function sanitizeBaseName(value: string): string {
  const cleaned = value
    .replaceAll("\\", "/")
    .split("/")
    .pop()
    ?.replace(SAFE_FILE_CHARS, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "") ?? "";

  return cleaned;
}

export function sanitizeOutputFileName(outputFileName: string | undefined): string | null {
  if (!outputFileName) {
    return null;
  }

  const base = sanitizeBaseName(outputFileName.trim());
  if (!base) {
    return null;
  }

  const withoutExtension = base.replace(/\.[A-Za-z0-9]+$/u, "");
  const finalBase = withoutExtension || "output";
  return `${finalBase}.mp4`;
}

export function defaultOutputFileName(inputVideoName: string): string {
  const fileBase = path.parse(inputVideoName).name;
  const sanitizedBase = sanitizeBaseName(fileBase);
  const finalBase = sanitizedBase || "video";
  return `${finalBase}-branded.mp4`;
}

export async function resolveCollisionSafeOutput(
  outputDir: string,
  requestedName: string
): Promise<{ fileName: string; fullPath: string }> {
  const parsed = path.parse(requestedName);
  const baseName = parsed.name || "output";
  const extension = ".mp4";

  let attempt = 0;
  while (true) {
    const suffix = attempt === 0 ? "" : `-${attempt}`;
    const candidateName = `${baseName}${suffix}${extension}`;
    const candidatePath = path.join(outputDir, candidateName);
    if (!(await fileExists(candidatePath))) {
      return { fileName: candidateName, fullPath: candidatePath };
    }
    attempt += 1;
  }
}
