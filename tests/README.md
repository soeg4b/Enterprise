# DeliverIQ — Test Suite

This workspace contains the executable test suite produced by Stage [8] Tester.

## Layout

```
tests/
├── unit/           # Vitest — pure-function & module tests (no infra)
│   └── engine/
│       ├── milestone.test.ts        # 25+ engine cases (TC-ENG-U-*)
│       └── excel-mapping.test.ts    # Excel column → entity mapping
├── integration/    # Vitest + supertest — Fastify routes with mocked Prisma/Redis/queues
│   ├── helpers/
│   │   ├── buildApp.ts        # spins a Fastify app with selected route plugins
│   │   ├── fakePrisma.ts      # in-memory store fake
│   │   ├── fakeInfra.ts       # fake redis + queue + cache
│   │   └── fixtures.ts        # makeUser / bearerFor helpers
│   ├── _setup.ts              # vi.mock() registrations (loaded by vitest)
│   ├── health.test.ts
│   ├── auth.test.ts           # login happy/bad/rate-limit + /me
│   ├── rbac.test.ts           # 401/403 sweep
│   ├── orders.test.ts         # POST validation
│   ├── milestones.test.ts     # PATCH triggers recompute, state machine
│   ├── sync.test.ts           # IDOR (CQ-05) + state-machine (CQ-04) regressions
│   └── reports.test.ts        # cache hit / miss
└── e2e/            # Playwright — UI flows (API mocked via page.route)
    ├── login.spec.ts
    ├── orders.spec.ts
    ├── site-milestone.spec.ts
    └── import-wizard.spec.ts
```

## Running

From this directory:

```bash
# Install once at the monorepo root so workspaces are linked.
cd .. && npm install

# Unit + integration (no DB, no Redis required)
cd tests
npm test

# Subset
npm run test:unit
npm run test:integration

# E2E — needs the web app running on localhost:3000
# (`npm run dev:frontend` from monorepo root)
npx playwright install chromium     # one-off
npm run test:e2e
```

## Mocking strategy

Integration tests use **vitest module mocks** to substitute the production
`db/prisma`, `db/redis`, and `queues/queues` modules with in-memory fakes.
This keeps the backend route handlers under test (real code paths for
validation, RBAC, state machine) while removing infra dependencies. See
`integration/_setup.ts`.

## Conventions

- Test IDs (e.g. `TC-AUTH-I-001`) trace back to the QA test plan
  (`.artifacts/07-qa-test-plan.md` §4) for traceability.
- Tests are idempotent: each `beforeEach` clears the fake stores.
- E2E specs always intercept network calls so they can run against any
  build of the frontend without a live backend.
