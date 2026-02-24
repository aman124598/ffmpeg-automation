# Video Logo Overlay Tool

Local web MVP for branding videos with a logo overlay using FFmpeg.

## Prerequisites
- Node.js 22+
- npm 11+
- `ffmpeg` and `ffprobe` available on your system `PATH`

## Setup
```bash
npm install
```

## Run (Development)
```bash
npm run dev
```

Services:
- Frontend: `http://localhost:5173`
- API: `http://localhost:3000`

## Scripts
- `npm run dev` starts API + web app
- `npm run build` builds all workspaces
- `npm run test` runs unit/integration/frontend tests
- `npm run lint` runs ESLint
- `npm run typecheck` runs TypeScript checks

## API

### `POST /api/v1/process-video`
- Content-Type: `multipart/form-data`
- Fields:
  - `video` (required)
  - `logo` (required)
  - `outputFileName` (optional)

Success (`202`):
```json
{
  "status": "accepted",
  "jobId": "uuid",
  "message": "Processing started"
}
```

### `GET /api/v1/jobs/:jobId`
```json
{
  "status": "running",
  "progress": 34,
  "message": "Processing video",
  "downloadUrl": null,
  "outputFileName": null
}
```

### `GET /api/v1/jobs/:jobId/download`
- Returns generated output when status is `complete`
- Returns `409` while pending

### `GET /api/v1/health`
```json
{
  "status": "ok",
  "ffmpeg": true,
  "ffprobe": true
}
```

## Runtime Storage
- Upload temp files: `apps/api/storage/uploads`
- Generated outputs: `apps/api/storage/outputs`

## Common Troubleshooting
- `MISSING_DEPENDENCY`: Ensure `ffmpeg` and `ffprobe` commands are available.
- `UNREADABLE_MEDIA`: Input file is unsupported/corrupted.
- `PAYLOAD_TOO_LARGE`: Video > 1GB or logo > 20MB.

## Deploy Notes (Vercel + Render)

### Frontend on Vercel
- Set project root to `apps/web`
- Add env var `VITE_API_BASE_URL=https://<your-render-backend-domain>`

### Backend on Render
Render must install devDependencies during build (TypeScript/Vite/ts types live in dev deps). If you see `TS2688: Cannot find type definition file for 'node'`, update your Render service:
- Build command: `npm ci --include=dev && npm run build && npm prune --omit=dev`
- Start command: `npm run start -w @ffmpeg-automation/api`
- Env vars:
  - `NODE_ENV=production`
  - `CORS_ORIGIN=https://<your-vercel-domain>`
