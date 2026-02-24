import { spawn } from "node:child_process";

import type { DependencyState } from "../types.js";

function checkBinary(binaryName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(binaryName, ["-version"], { stdio: "ignore" });
    child.once("error", () => resolve(false));
    child.once("close", (code) => resolve(code === 0));
  });
}

export async function checkDependencies(): Promise<DependencyState> {
  const [ffmpeg, ffprobe] = await Promise.all([checkBinary("ffmpeg"), checkBinary("ffprobe")]);
  return { ffmpeg, ffprobe };
}
