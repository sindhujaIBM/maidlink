# MaidLink — Project Overview

## Monorepo Structure

```
maidlink/
├── frontend/                  # React 18 + Vite SPA
│   ├── src/
│   │   ├── api/               # Axios clients (one per service)
│   │   ├── components/        # Shared UI (Layout, Badge, Spinner…)
│   │   ├── pages/             # Route-level components
│   │   └── App.tsx            # React Router routes
│   └── .env.production        # Production VITE_ env vars
│
├── services/                  # Lambda microservices (each deploys independently)
│   ├── auth/                  # Google OAuth exchange, JWT issue, admin login
│   ├── users/                 # User profiles, maid profiles, photo upload URLs
│   ├── booking/               # Bookings + availability (recurring, overrides, slots)
│   └── admin/                 # Admin: approve/reject maids, view all bookings/users
│
├── packages/
│   └── shared/                # Shared TypeScript: DB client, JWT, errors, middleware, validation
│
├── database/
│   ├── migrations/            # 001–009 SQL files, run in order, tracked in schema_migrations
│   ├── seeds/                 # Sample maids + admin user
│   └── scripts/               # migrate.ts + seed.ts (local), serverless.yml (prod Lambda)
│
├── infrastructure/
│   └── serverless.yml         # CloudFormation: VPC, Aurora, S3, CloudFront
│
├── deploy-services.sh         # Fetches secrets → deploys all 4 Lambda services
└── package.json               # npm workspaces root
```

---

## Production URLs

### Frontend
```
https://dl8ye2ifgai5e.cloudfront.net
```

### Backend APIs
```
Auth:    https://w60uleji5c.execute-api.ca-west-1.amazonaws.com/prod
Users:   https://rh9nojf0g0.execute-api.ca-west-1.amazonaws.com/prod
Booking: https://mu054qkxab.execute-api.ca-west-1.amazonaws.com/prod
Admin:   https://46ke6cq4t4.execute-api.ca-west-1.amazonaws.com/prod
```

### Database (private — Lambda-only access via VPC)
```
Host:   maidlink-infra-prod-rdscluster-gcbzimdjjqt2.cluster-cspqotkdhyca.ca-west-1.rds.amazonaws.com
Port:   5432
Name:   maidlink
Engine: Aurora PostgreSQL 15.8
```

---

## AWS Resources
| Resource | ID / Name |
|---|---|
| Region | ca-west-1 |
| CloudFront Distribution | E2C1HS3K184GKW |
| Frontend S3 Bucket | maidlink-infra-prod-frontendbucket-qtg9tfwkus1z |
| Photos S3 Bucket | maidlink-infra-prod-photosbucket-f9zualsqxenk |
| Infrastructure Stack | maidlink-infra-prod |
| VPC | vpc-03d32d3f6a6dc0635 |
| Lambda Security Group | sg-055801edf871f4e60 |

---

## Re-deploying

### Frontend only
```bash
npm run build --workspace=frontend
aws s3 sync frontend/dist/ s3://maidlink-infra-prod-frontendbucket-qtg9tfwkus1z/ --delete --region ca-west-1
aws cloudfront create-invalidation --distribution-id E2C1HS3K184GKW --paths "/*"
```

### All Lambda services
```bash
bash deploy-services.sh
```

### DB migrations / seeds (Aurora is private — must use Lambda)
```bash
cd database && npx serverless deploy --stage prod
aws lambda invoke --function-name maidlink-migrate-prod-runMigrations --region ca-west-1 --payload '{}' /tmp/result.json
aws lambda invoke --function-name maidlink-migrate-prod-runSeeds --region ca-west-1 --payload '{}' /tmp/result.json
cd database && npx serverless remove --stage prod
```

---

## Connecting a DB Client (TablePlus / pgAdmin) to Aurora

Aurora is in a private VPC — use EC2 Instance Connect Endpoint to tunnel port 5432 to your laptop.

### One-time setup: create the EIC endpoint
```bash
aws ec2 create-instance-connect-endpoint \
  --subnet-id subnet-0a8738edb8eff6309 \
  --security-group-id sg-055801edf871f4e60 \
  --region ca-west-1
```
Note the `InstanceConnectEndpointId` from the output (looks like `eice-xxxxxxxxxxxxxxxxx`).

### Every time you want to browse the DB
**Step 1 — open the tunnel (keep this terminal open):**
```bash
aws ec2-instance-connect open-tunnel \
  --instance-connect-endpoint-id <eice-id> \
  --remote-port 5432 \
  --local-port 5432 \
  --private-ip-address <aurora-private-ip> \
  --region ca-west-1
```
To find Aurora's private IP:
```bash
dig +short maidlink-infra-prod-rdscluster-gcbzimdjjqt2.cluster-cspqotkdhyca.ca-west-1.rds.amazonaws.com
```

**Step 2 — connect in TablePlus / pgAdmin:**
```
Host:     localhost
Port:     5432
Database: maidlink
User:     maidlink_app
Password: (fetch from Secrets Manager)
SSL:      require
```
Fetch password:
```bash
aws secretsmanager get-secret-value \
  --secret-id /maidlink/prod/rds-credentials \
  --region ca-west-1 \
  --query SecretString --output text | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['password'])"
```

---

## Local Dev
```bash
npm install
npm run db:up        # start local Postgres via Docker
npm run db:migrate   # run migrations
npm run db:seed      # seed sample data
npm run dev          # start all services + frontend concurrently
```
