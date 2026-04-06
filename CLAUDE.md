# MaidLink — Claude Code Instructions

## Project
Full-stack maid booking platform for Calgary. Monorepo with npm workspaces.

## Commands
```bash
npm install          # install all workspaces
npm run db:up        # start local Postgres (Docker)
npm run db:migrate   # run migrations
npm run db:seed      # seed dev data
npm run dev          # start all services + frontend concurrently
npm test             # run all unit tests (Vitest, no DB needed)
npm run test:watch   # watch mode during development
```

## Stack
- **Frontend:** React 18 + Vite + Tailwind CSS (`frontend/`)
- **Backend:** Node.js 20 + TypeScript + AWS Lambda via Serverless Framework v3 (`services/`)
- **Shared:** `packages/shared` — types, DB client, JWT, errors, withAuth middleware
- **DB:** Aurora Serverless v2 (PostgreSQL 15.10), direct Lambda connection
- **Auth:** Google OAuth 2.0 → HS256 JWT (24h expiry)
- **Storage:** S3 private bucket + pre-signed URLs
- **AI:** Amazon Nova Lite (`us.amazon.nova-lite-v1:0`) via Bedrock us-west-2 — Haiku fallback removed (Anthropic use-case form not submitted for this account; `ResourceNotFoundException` if used)
- **Region:** `ca-west-1`

## Service Ports (local)
| Service  | HTTP  | Lambda |
|----------|-------|--------|
| Auth     | 3001  | 3101   |
| Users    | 3002  | 3102   |
| Booking  | 3003  | 3103   |
| Admin    | 4004  | 4104   |
| Frontend | 5173  | —      |

## FEATURES.md
`FEATURES.md` is the living feature registry. After implementing any feature — no matter how small — update it:
- Move the feature to the **Implemented** section with a ✅ and a one-line description
- Remove it from the roadmap/ideas sections if it was listed there
- Add any new ideas or follow-up tasks that surfaced during implementation

## Testing
- **Framework:** Vitest — configured via `vitest.workspace.ts` at root; covers `packages/shared`, `services/booking`, and `frontend`
- **Unit tests** (no DB, no AWS): `packages/shared/src/__tests__/`, `services/booking/src/__tests__/*.unit.test.ts`, `frontend/src/__tests__/`
- **Integration tests** (Phase 2, requires Docker DB): `services/*/src/__tests__/*.integration.test.ts` — run `npm run db:up` first
- **Estimator calc logic** lives in `frontend/src/lib/estimatorCalc.ts` (extracted from widget) — import from there, not from the component
- `jest` remains in devDependencies but is unused — Vitest is the test runner

## Key Rules
- **Package manager: npm only** — never use yarn or pnpm
- Always use `withAuth` from `@maidlink/shared` to protect Lambda handlers
- S3 IAM Resource in serverless.yml must use `${env:PHOTOS_BUCKET}` — never a hardcoded wildcard pattern that won't match the deployed bucket name
- Amazon Nova models require cross-region inference profile IDs: `us.amazon.nova-lite-v1:0` (not `amazon.nova-lite-v1:0`)
- Bedrock IAM needs both `::foundation-model/*` and `:*:inference-profile/*` ARNs, and region must be `*` (not `us-west-2`) — inference profiles route dynamically across us-east-1/us-east-2/us-west-2
- S3 presigned PUT URLs must NOT include `ContentLength` in the PutObjectCommand — S3 enforces an exact byte match and will reject any upload that doesn't match, causing silent failures
- `pg` error code `23P01` = exclusion_violation → return 409 Conflict (used for no-double-booking constraint)
- `btree_gist` extension must exist (migration 001) for TSRANGE EXCLUDE constraint
- **SES is not available in `ca-west-1`** — always use `us-east-1` for the SES client; SES IaC lives in `infrastructure/serverless-ses.yml` (separate stack, deploys to `us-east-1`)

## Migrations
Migrations are hardcoded inline in `database/migrate-handler.ts` — adding a `.sql` file to `database/migrations/` is NOT enough. You must also add the migration entry to the `MIGRATIONS` array in `migrate-handler.ts`. To run migrations in production:
```bash
cd database && npx serverless deploy --stage prod
aws lambda invoke --function-name maidlink-migrate-prod-runMigrations --region ca-west-1 /tmp/out.json && cat /tmp/out.json
npx serverless remove --stage prod
```

## Deploy
```bash
# SES identity (one-time, us-east-1):
cd infrastructure && npx serverless deploy -c serverless-ses.yml --stage prod --region us-east-1
# Then add the 3 DKIM CNAME records output to maidlink.ca Route 53 hosted zone

# All services + frontend:
./deploy-services.sh

# Frontend only:
cd frontend && npm run build
aws s3 sync dist/ s3://maidlink-infra-prod-frontendbucket-qtg9tfwkus1z/ --delete
aws cloudfront create-invalidation --distribution-id E2C1HS3K184GKW --paths "/*"
```

## Production URLs
- App: https://maidlink.ca
- Auth API: https://w60uleji5c.execute-api.ca-west-1.amazonaws.com/prod
- Users API: https://rh9nojf0g0.execute-api.ca-west-1.amazonaws.com/prod
- Booking API: https://mu054qkxab.execute-api.ca-west-1.amazonaws.com/prod
- Admin API: https://46ke6cq4t4.execute-api.ca-west-1.amazonaws.com/prod

## Debugging
1. Identify root cause (not just symptoms)
2. Explain why it happened
3. Provide a fix
4. Suggest prevention

## Feature Design
- Ask clarifying questions if requirements are vague
- Offer 2–3 implementation options for non-trivial features with tradeoffs

## AI/Estimator Domain Notes
- Image quality may vary (blurry, dark, partial rooms) — handle gracefully
- Degrade gracefully when AI confidence is low; never block the user flow
