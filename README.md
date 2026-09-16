# Bidinn CRM

From the repo root:

```bash
yarn setup    # first time only — installs backend + frontend deps
yarn start    # backend (http://localhost:8001) + frontend (http://localhost:3000)
```

`yarn start` prints both logs in one terminal, prefixed `[backend]` (cyan) and `[frontend]` (magenta). `Ctrl+C` stops both. Frontend `/api` is proxied to the backend.

To run one side only: `yarn start:backend` or `yarn start:frontend`.

The production frontend build is an installable PWA (manifest + service worker). Service workers are production-only — use `yarn --cwd frontend build` and serve `frontend/build` (or the Express server) to test install, caching, and push. Generate Web Push keys with `yarn --cwd backend vapid-keys` and set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` in `backend/.env`.
