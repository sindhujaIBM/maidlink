# MaidLink — Maid Booking Platform MVP

A production-ready MVP for booking home cleaners in Calgary, built with React, AWS Lambda, Aurora Serverless v2, and the Serverless Framework.

**Live:** https://maidlink.app

---

## Architecture

```
Browser (React SPA on S3/CloudFront)
  └── 4 × API Gateway + Lambda services
        ├── maidlink-auth     :3001  — Google OAuth exchange, JWT issuance
        ├── maidlink-users    :3002  — Maid profiles, photo uploads, estimator
        ├── maidlink-booking  :3003  — Booking CRUD + availability
        └── maidlink-admin    :3004  — Admin approval queue
              ↓
        Aurora Serverless v2 (PostgreSQL 15)
        S3 bucket — profile photos + ID documents + estimator photos (private, pre-signed URLs)
        AWS Bedrock (us-west-2) — Nova Lite / Claude 3.5 Haiku for AI estimator
```

**Region:** `ca-west-1` (Calgary)

**Concurrency safety:** PostgreSQL `TSRANGE EXCLUDE` constraint + `SELECT FOR UPDATE` transaction in booking handler. No double-bookings ever.

---

## Monorepo Layout

```
maidlink/
├── frontend/               # React + Vite + Tailwind SPA
├── services/
│   ├── auth/               # POST /auth/google, GET /auth/me
│   ├── users/              # Maid profiles, photo upload, browse
│   ├── booking/            # Bookings + availability management
│   └── admin/              # Approve/reject maids, admin views
├── packages/
│   └── shared/             # Shared types, DB client, JWT, validation
├── database/
│   ├── migrations/         # 001–008 SQL migration files
│   └── seeds/              # Sample maids + admin user
├── infrastructure/
│   └── serverless.yml      # VPC, Aurora, S3, CloudFront
├── docker-compose.yml      # Local PostgreSQL
└── .github/workflows/      # CI (lint/typecheck) + CD (deploy on merge)
```

---

## Prerequisites

- Node 20 (`nvm use`)
- npm 9+
- Docker Desktop (for local Postgres)
- AWS CLI v2 (for deployment)
- Serverless Framework v3: `npm install -g serverless@3`

---

## Local Development Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Where to get it |
|----------|----------------|
| `GOOGLE_CLIENT_ID` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) — create an OAuth 2.0 client |
| `GOOGLE_CLIENT_SECRET` | Same as above |
| `JWT_SECRET` | Any string ≥ 32 chars: `openssl rand -base64 48` |

**Google OAuth setup:**
- Go to APIs & Services → Credentials → Create OAuth Client ID
- Application type: Web application
- Authorized redirect URIs: `http://localhost:5173/auth/callback`
- Copy Client ID and Secret to `.env`

### 3. Start local Postgres

```bash
npm run db:up
```

Migrations run automatically on first start (Docker mounts `database/migrations/` into `docker-entrypoint-initdb.d`).

### 4. Run migrations + seed data

```bash
npm run db:migrate
npm run db:seed
```

Seeds create:
- `admin@maidlink.local` — admin user
- `sarah@maidlink.local`, `maria@maidlink.local` — approved maids with availability
- `james@maidlink.local` — pending maid (for admin approval testing)
- `alice@maidlink.local` — sample customer

### 5. Start all services

```bash
npm run dev
```

This starts all 4 Lambda services (serverless-offline) + the Vite dev server in parallel:

| Service  | URL |
|----------|-----|
| Auth     | http://localhost:3001 |
| Users    | http://localhost:3002 |
| Booking  | http://localhost:3003 |
| Admin    | http://localhost:3004 |
| Frontend | http://localhost:5173 |

### 6. Open the app

Navigate to http://localhost:5173 and sign in with Google.

---

## API Routes Reference

### Auth (`localhost:3001`)
| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/google | Exchange Google code → JWT |
| GET  | /auth/me | Get current user + roles |

### Users (`localhost:3002`)
| Method | Path | Description |
|--------|------|-------------|
| GET  | /users/me | Own user profile |
| PUT  | /users/me | Update name / phone |
| POST | /users/me/maid-profile | Register as maid (requires photo + ID doc) |
| GET  | /users/me/maid-profile | Own maid profile |
| PUT  | /users/me/maid-profile | Update maid profile |
| GET  | /users/me/photo-upload-url | Pre-signed S3 PUT URL for profile photo |
| GET  | /users/me/id-doc-upload-url | Pre-signed S3 PUT URL for government ID |
| GET  | /users/me/estimator-photo-upload-url | Pre-signed S3 PUT URL for estimator photo |
| POST | /users/me/estimator/analyze | AI-powered cleaning time analysis (Bedrock) |
| GET  | /users/maids | Browse approved maids |
| GET  | /users/maids/:id | Single maid public profile |

### Booking (`localhost:3003`)
| Method | Path | Description |
|--------|------|-------------|
| POST | /bookings | Create booking (concurrency-safe) |
| GET  | /bookings | List own bookings |
| GET  | /bookings/:id | Single booking |
| DELETE | /bookings/:id | Cancel booking |
| GET  | /bookings/maids/:maidId/slots | Free time slots (next 14 days) |
| GET  | /availabilities | Own availability rules |
| POST | /availabilities/recurring | Add recurring slot |
| DELETE | /availabilities/recurring/:id | Remove recurring slot |
| POST | /availabilities/overrides | Add one-off override |
| DELETE | /availabilities/overrides/:id | Remove override |

### Admin (`localhost:3004`)
| Method | Path | Description |
|--------|------|-------------|
| GET  | /admin/maids | List maids (filter by status) |
| POST | /admin/maids/:id/approve | Approve maid |
| POST | /admin/maids/:id/reject | Reject maid with reason |
| GET  | /admin/bookings | All bookings |
| GET  | /admin/users | All users |

---

## Testing Booking Concurrency

```bash
# 1. Get a JWT (log in via the UI and copy from localStorage → maidlink_token)
TOKEN="your-jwt-here"
MAID_ID="cccccccc-0000-0000-0000-000000000001"  # Sarah's maid profile ID from seed

# 2. Fire two simultaneous booking requests for the same slot
for i in 1 2; do
  curl -s -X POST http://localhost:3003/bookings \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"maidId\": \"$MAID_ID\",
      \"startAt\": \"$(date -u -v+1d +%Y-%m-%d)T10:00:00.000Z\",
      \"endAt\":   \"$(date -u -v+1d +%Y-%m-%d)T13:00:00.000Z\",
      \"addressLine1\": \"123 Main St NW\",
      \"postalCode\": \"T2P1J9\"
    }" &
done
wait

# Expected: one 201 Created, one 409 Conflict
# {"data": {...booking...}} and {"error": {"code": "CONFLICT", "message": "Time slot already booked"}}
```

---

## AWS Deployment

### One-time setup

```bash
# 1. Configure AWS CLI
aws configure
# Region: ca-west-1

# 2. Store secrets in SSM Parameter Store
aws ssm put-parameter --name /maidlink/prod/jwt-secret \
  --value "$(openssl rand -base64 48)" --type SecureString

aws ssm put-parameter --name /maidlink/prod/google-client-id \
  --value "your-client-id.apps.googleusercontent.com" --type String

aws ssm put-parameter --name /maidlink/prod/google-client-secret \
  --value "your-secret" --type SecureString
```

### Deploy (manual)

```bash
# Step 1: Infrastructure (VPC, RDS, S3, CloudFront)
cd infrastructure && serverless deploy --stage prod

# Step 2: Run DB migrations against Aurora
# Connect via AWS Systems Manager Session Manager or a bastion host, then:
DB_HOST=<rds-proxy-endpoint from CloudFormation outputs> \
DB_USER=maidlink_app \
DB_PASSWORD=<from Secrets Manager> \
DB_SSL=true \
npm run db:migrate

# Step 3: Deploy services
cd services/auth    && serverless deploy --stage prod
cd services/users   && serverless deploy --stage prod
cd services/booking && serverless deploy --stage prod
cd services/admin   && serverless deploy --stage prod

# Step 4: Build and deploy frontend
# Get the API Gateway URLs from the serverless deploy output, then:
VITE_AUTH_API_URL=https://... \
VITE_USERS_API_URL=https://... \
VITE_BOOKING_API_URL=https://... \
VITE_ADMIN_API_URL=https://... \
VITE_GOOGLE_CLIENT_ID=... \
VITE_GOOGLE_REDIRECT_URI=https://your-cloudfront-domain/auth/callback \
npm run build --workspace=frontend

BUCKET=$(aws cloudformation describe-stacks --stack-name maidlink-infra-prod \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucket'].OutputValue" --output text)
aws s3 sync frontend/dist/ s3://$BUCKET/ --delete
```

### Automated CD

After the one-time setup, push to `main` (or merge a PR) and GitHub Actions will:
1. Deploy infrastructure
2. Deploy all 4 services in parallel
3. Build and deploy the frontend to S3 + invalidate CloudFront

Required GitHub secrets:

| Secret | Value |
|--------|-------|
| `AWS_ACCESS_KEY_ID` | IAM user with `AdministratorAccess` for initial setup |
| `AWS_SECRET_ACCESS_KEY` | Same user |
| `VITE_GOOGLE_CLIENT_ID` | Your prod Google OAuth client ID |
| `VITE_GOOGLE_REDIRECT_URI` | `https://your-cloudfront-domain/auth/callback` |
| `VITE_AUTH_API_URL` | API Gateway URL for auth service |
| `VITE_USERS_API_URL` | API Gateway URL for users service |
| `VITE_BOOKING_API_URL` | API Gateway URL for booking service |
| `VITE_ADMIN_API_URL` | API Gateway URL for admin service |

---

## Database Schema Summary

| Table | Purpose |
|-------|---------|
| `users` | All accounts (keyed by Google `sub`) |
| `user_roles` | Many-to-many: user ↔ CUSTOMER / MAID / ADMIN roles |
| `maid_profiles` | Extended profile for MAID users (includes `photo_s3_key`, `id_doc_s3_key`) |
| `availability_recurring` | Weekly recurring availability windows |
| `availability_overrides` | One-off availability additions or blocks |
| `bookings` | Bookings with TSRANGE EXCLUDE concurrency constraint |

**No-overbooking guarantee:**
The `bookings` table has a PostgreSQL `EXCLUDE USING GIST (maid_id WITH =, during WITH &&)` constraint. Any INSERT that would create an overlapping booking for the same maid raises error `23P01` (exclusion_violation). The application additionally uses `SELECT FOR UPDATE` to serialize concurrent writes cleanly.

---

## Features

### Cleaning Time Estimator (`/estimate`)
Public page — no login required for the base estimate.

- **Phase 1 (always available):** Step through bedrooms, bathrooms, size range, condition, and add-ons to get an instant estimate for 1 or 2 cleaners.
- **Phase 2 (AI-powered, requires login):** Upload up to 5 room photos. The backend fetches them from S3, sends them to Amazon Nova Lite via AWS Bedrock, and returns an AI-generated condition assessment, adjusted time estimate, and key areas to focus on. Falls back to Claude 3.5 Haiku if Nova Lite is unavailable. Estimator photos are temporary (not stored in the DB) and can be auto-deleted via an S3 lifecycle rule.

### Maid Registration
To apply as a maid, users must upload both a **profile photo** and a **government ID document** before submitting their application. Admins can view these documents from the approval queue.

---

## Known Limitations (MVP)

| Limitation | Post-MVP fix |
|-----------|-------------|
| 4 separate API Gateway URLs | Consolidate with custom domain + base path mapping |
| HS256 JWT, 24h expiry, no refresh | RS256 + refresh token rotation |
| No email notifications | AWS SES on booking/approval events |
| No payments | Stripe PaymentIntent at booking creation |
| Calgary postal validation approximate | Curated FSA list with official Canada Post data |
| Cross-midnight bookings not supported | Multi-day availability resolution |
| No recurring bookings | Recurrence rule table + booking generation cron |
| Lambda-in-VPC cold start (~200–800ms) | Provisioned concurrency on high-traffic functions |
| Estimator photos not auto-deleted | Add S3 lifecycle rule to expire `estimator-photos/` after 1 day |
| Bedrock called cross-region (us-west-2) | Switch to `ca-west-1` when Nova Lite becomes available there |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, React Router v6, TanStack Query |
| Backend | Node.js 20, TypeScript, AWS Lambda |
| API | AWS API Gateway (REST) |
| Database | Aurora Serverless v2 (PostgreSQL 15) |
| Auth | Google OAuth 2.0 → HS256 JWT |
| File storage | Amazon S3 (private, pre-signed URLs) |
| AI | AWS Bedrock — Amazon Nova Lite (primary), Claude 3.5 Haiku (fallback) |
| IaC | Serverless Framework v3 |
| CI/CD | GitHub Actions |
| Observability | Amazon CloudWatch Logs |
