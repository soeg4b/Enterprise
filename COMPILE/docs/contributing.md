# Contributing

Thanks for contributing to PDC Enterprise.

## 1. Quick start

See [setup-dev.md](setup-dev.md) for full setup. Short version:

```bash
cp .env.example .env
docker compose up -d postgres redis minio
npm install
npm run prisma:generate && npm run prisma:migrate && npm run prisma:seed
npm run dev:backend       # terminal 1
npm run dev:frontend      # terminal 2
```

## 2. Branch & PR workflow

- Branch from `main`: `feat/<scope>-<short>`, `fix/<scope>-<short>`, `chore/...`, `docs/...`.
- Keep PRs focused (< 500 LOC where possible).
- Required status check on `main`: `ci-success` (lint + typecheck + tests + audit + scans).
- Requires 1 review.
- Squash-merge by default.

## 3. Commit messages

Conventional Commits style is preferred:

```
feat(backend): add /v1/imports/:id/commit
fix(sync): enforce FE site-ownership in FieldUpdate branch
docs(rbac): clarify DH scope
chore(deps): bump fastify to 4.28
```

## 4. Code style

- TypeScript strict mode is on across all workspaces.
- Backend: Fastify route plugins per module; pure compute lives in `engine/`. Validate every input with Zod.
- Frontend: Next.js App Router, Tailwind, components in `src/frontend/components/`.
- Mobile: small surface; SQLite outbox is the source of truth for unsynced edits.
- Run `npm run typecheck` before opening a PR.

## 5. Tests

- Unit: `cd tests && npm run test:unit` (Vitest, no infra).
- Integration: `cd tests && npm run test:integration` (Vitest + Supertest, mocks Prisma / Redis / queues).
- E2E: `cd tests && npm run test:e2e` (Playwright; needs the web app on :3601).
- Add tests for new business rules; pure engine functions belong in `tests/unit/engine/`.

## 6. Database changes

- Edit [src/database/prisma/schema.prisma](../src/database/prisma/schema.prisma).
- Generate a migration: `npx prisma migrate dev --name <slug>` from `src/database/`.
- Migrations must be **expand-then-contract** (additive, then a follow-up cleanup) so we can roll back the app without downgrading the DB. See [deployment.md](deployment.md#4-migration--rollback).
- Update the seed if the change affects the sample portfolio.

## 7. Security

- Never commit secrets. Gitleaks runs in CI.
- Validate every external input (Zod schemas) and use Prisma parameterised queries (no `$queryRaw` with user input).
- Add `requireRole(...)` to every mutating route.
- For production, see the pre-prod checklist in [security.md](security.md#8-pre-prod-checklist).

## 8. Documentation

- Code that adds an endpoint must update [api.md](api.md).
- Schema changes must update [data-model.md](data-model.md).
- Engine changes must update [milestone-engine.md](milestone-engine.md) (with a worked example).
- New env vars must be added to `.env.example`.

## 9. Adding a new endpoint

1. Define the Zod schema(s) in the route file.
2. `requireAuth` + `requireRole(...)` in the handler options.
3. Audit (`audit({...})`) on every successful write.
4. If async work is needed, add a BullMQ producer + worker.
5. Add unit + integration tests.
6. Update [api.md](api.md) with a curl example.

## 10. Releasing

- Cut a `release/<YYYYMMDD>-<n>` git tag after a successful production deploy.
- Update [changelog.md](changelog.md) under a new version heading.

## 11. Code of conduct

Be respectful. Disagreements on technical direction are welcome; ad hominem is not.
