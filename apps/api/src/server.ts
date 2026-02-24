import { createApp } from "./app.js";
import { checkDependencies } from "./utils/dependencies.js";

async function bootstrap(): Promise<void> {
  const dependencies = await checkDependencies();
  const app = createApp({ dependencies });

  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  app.listen(port, () => {
    console.info(
      `API listening on http://localhost:${port} (ffmpeg=${dependencies.ffmpeg ? "ok" : "missing"}, ffprobe=${dependencies.ffprobe ? "ok" : "missing"})`
    );
  });
}

bootstrap().catch((error: unknown) => {
  console.error("Failed to start API server", error);
  process.exit(1);
});
