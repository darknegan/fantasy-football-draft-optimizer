# AGENTS.md

## Cursor Cloud specific instructions

DraftLab is a fantasy-football draft optimizer: an npm-workspaces monorepo (`apps/*`, `packages/*`). The full local end-to-end stack is **Postgres → Fastify API (`:3001`) → Angular web (`:4200`)**. Standard commands live in `README.md` and the root `package.json` scripts; only the non-obvious cloud caveats are captured here.

### Services

| Service | Command | Notes |
| --- | --- | --- |
| Postgres 16 | `sudo pg_ctlcluster 16 main start` | Native install (no Docker in this env). Must be started each session — see below. |
| API (`apps/api`) | `npm run dev:api` | Fastify on `:3001`; auto-loads `apps/api/.env`. |
| Web (`apps/web`) | `npm run dev:web` | Angular on `:4200`, proxies `/api` `/auth` `/me` `/ws` to `:3001`. |

### Non-obvious setup caveats

- **Shared packages must be built before running/testing anything.** `apps/*` import `@draftlab/*` from their compiled `dist/` (package `exports`, no tsconfig path aliases). The update script runs `npm run build:packages`; if you change code under `packages/*`, rebuild with `npm run build:packages` (dev servers do NOT rebuild sibling packages on the fly).
- **Postgres is native, not Docker.** This environment has no Docker, so the `docker compose up -d postgres` path in `README.md` does not apply. Postgres 16 is installed via apt and a local cluster + `draftlab` role/db + `db/schema.sql` are already provisioned. The cluster does not auto-start on boot — run `sudo pg_ctlcluster 16 main start` at the start of a session (check with `sudo pg_lsclusters`). Local DSN: `postgresql://draftlab:draftlab@127.0.0.1:5432/draftlab`.
- **`apps/api/.env` is required and gitignored.** The API exits if `DATABASE_URL`/`JWT_*` are missing. If the file is absent, create it from `apps/api/.env.example` and point `DATABASE_URL` at the local cluster above (the Supabase default in the example won't work here). `SEED_DEMO_USER=true` seeds `demo@draftlab.local` (password `demopassword`) with three leagues on API start.

### Lint / test

- Lint: `npm run lint` (`prettier --check .`) currently reports formatting warnings across many pre-existing files; this is the repo's existing state, not a setup breakage.
- Engines (no DB): `npm run test:engines` — all pass.
- API tests: `npm run test -w @draftlab/api` — needs Postgres running. One test, `src/data/__tests__/load-artifact.test.ts` (`projectedPoints` field mismatch), fails on a clean checkout independent of environment setup.

### Health check

`curl -s http://localhost:3001/api/health` should return `{"ok":true,"service":"draftlab-api","database":"up"}` once Postgres and the API are up.
