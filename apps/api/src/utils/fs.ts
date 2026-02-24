import { access, mkdir, rm } from "node:fs/promises";
import { constants } from "node:fs";

export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function removeFileIfPresent(filePath: string): Promise<void> {
  try {
    await rm(filePath, { force: true });
  } catch {
    // Ignore best-effort cleanup errors.
  }
}
