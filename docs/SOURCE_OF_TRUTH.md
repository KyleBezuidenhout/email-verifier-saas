# Source of truth: repository and workers

## Canonical Git repository

- **GitHub:** `KyleBezuidenhout/email-verifier-saas`
- **This directory** (`email-verifier-saas` repo root) is the **only** place production code should be edited, committed, and pushed.

## Railway

All Railway services connect to **`KyleBezuidenhout/email-verifier-saas`** on branch **`main`**.

| Service | Relevant path |
|--------|----------------|
| Node.js worker (BullMQ / `index.js`) | `workers/index.js` via `workers/Dockerfile.nodejs` |
| Backend (FastAPI) | `backend/` (often Root Directory = `/backend`) |
| Python workers | `workers/Dockerfile.*` |

Pushing to `main` triggers deploys. There is **no** separate “parent monorepo” that Railway reads for these services.

## Avoid duplicate clones (what went wrong before)

A **nested second clone** of the same repo inside another folder (e.g. `SomeFolder/email-verifier-saas/email-verifier-saas/`) or a **parallel folder** with the same remote causes:

- Edits in one copy **never deploy** (Railway uses GitHub, not your local duplicate).
- Agents or humans “fix” the wrong `workers/index.js`.
- Drift between “the file that runs in prod” and “the file you edited locally.”

### Rules

1. **One working copy per machine** for this product: clone `email-verifier-saas` once, open that folder in Cursor.
2. **Do not** `git clone` this repo inside itself.
3. If you use a wrapper folder (e.g. “Cold-Email-SaaS”), either:
   - make it **not** a Git repo and treat `email-verifier-saas/` as the only Git root, or
   - use a **single** repo and delete/archive the extra copy.

## Quick verification

```bash
git remote -v
# Should show: git@github.com:KyleBezuidenhout/email-verifier-saas.git (or https equivalent)

git rev-parse HEAD
git rev-parse origin/main
# Should match after pull
```

## One-time cleanup after removing the global lock

If you previously ran workers with `global:job-processing-lock`, an old key may linger in Redis (TTL up to 24h). New code ignores it. Optional cleanup:

```redis
DEL global:job-processing-lock
```

## Related docs

- [Concurrent key pool architecture plan](./CONCURRENT_KEY_POOL_ARCHITECTURE_PLAN.md) (future optimization; not yet implemented)
