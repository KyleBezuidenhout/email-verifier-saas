# BillionVerifier (email-verifier-saas)

Monorepo: **FastAPI** (`backend/`), **Next.js** (`frontend/`), **workers** (Node + Python).

## Development

- **Clone this repo once** and open it as your Cursor/workspace root.  
- **Do not** nest a second clone of the same GitHub repo inside this folder — see **[docs/SOURCE_OF_TRUTH.md](docs/SOURCE_OF_TRUTH.md)**.

## Deploy

Railway services use GitHub **`KyleBezuidenhout/email-verifier-saas`** branch **`main`**.  
Node email worker: `workers/index.js` + `workers/Dockerfile.nodejs`.

## Docs

| Doc | Purpose |
|-----|--------|
| [docs/SOURCE_OF_TRUTH.md](docs/SOURCE_OF_TRUTH.md) | Canonical repo, Railway paths, avoiding duplicate clones |
| [docs/CONCURRENT_KEY_POOL_ARCHITECTURE_PLAN.md](docs/CONCURRENT_KEY_POOL_ARCHITECTURE_PLAN.md) | Future architecture: concurrent jobs + key pool |
