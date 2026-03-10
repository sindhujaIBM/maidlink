#!/bin/bash
set -e

ROOT="/Users/sindhuja/Desktop/maidlink"

# ── Secrets ───────────────────────────────────────────────────────────────────
SECRET=$(aws secretsmanager get-secret-value \
  --secret-id /maidlink/prod/rds-credentials \
  --region ca-west-1 --query SecretString --output text)

export DB_HOST="maidlink-infra-prod-rdscluster-gcbzimdjjqt2.cluster-cspqotkdhyca.ca-west-1.rds.amazonaws.com"
export DB_PORT="5432"
export DB_NAME="maidlink"
export DB_USER=$(echo $SECRET | python3 -c "import sys,json; print(json.load(sys.stdin)['username'])")
export DB_PASSWORD=$(echo $SECRET | python3 -c "import sys,json; print(json.load(sys.stdin)['password'])")
export DB_SSL="true"
export PHOTOS_BUCKET="maidlink-infra-prod-photosbucket-f9zualsqxenk"

export JWT_SECRET=$(aws ssm get-parameter \
  --name /maidlink/prod/jwt-secret --with-decryption \
  --region ca-west-1 --query Parameter.Value --output text)

export GOOGLE_CLIENT_ID=$(aws ssm get-parameter \
  --name /maidlink/prod/google-client-id --with-decryption \
  --region ca-west-1 --query Parameter.Value --output text)

export GOOGLE_CLIENT_SECRET=$(aws ssm get-parameter \
  --name /maidlink/prod/google-client-secret --with-decryption \
  --region ca-west-1 --query Parameter.Value --output text)

# ── Lambda services ───────────────────────────────────────────────────────────
echo "Deploying auth..."
cd "$ROOT/services/auth" && npx serverless deploy --stage prod

echo "Deploying users..."
cd "$ROOT/services/users" && npx serverless deploy --stage prod

echo "Deploying booking..."
cd "$ROOT/services/booking" && npx serverless deploy --stage prod

echo "Deploying admin..."
cd "$ROOT/services/admin" && npx serverless deploy --stage prod

# ── Clean up old Lambda versions (keep only the most recent numbered version) ─
echo "Cleaning up old Lambda versions..."
for fn in $(aws lambda list-functions --region ca-west-1 \
  --query 'Functions[?starts_with(FunctionName, `maidlink-`)].FunctionName' \
  --output text); do
  old_versions=$(aws lambda list-versions-by-function \
    --function-name "$fn" --region ca-west-1 \
    --query 'Versions[?Version!=`$LATEST`] | sort_by(@, &to_number(Version))[:-1].Version' \
    --output text)
  for v in $old_versions; do
    echo "  Deleting $fn:$v"
    aws lambda delete-function --function-name "$fn" --qualifier "$v" --region ca-west-1
  done
done

# ── Frontend ──────────────────────────────────────────────────────────────────
echo "Building frontend..."
cd "$ROOT/frontend" && npm run build

echo "Syncing to S3..."
aws s3 sync dist/ s3://maidlink-infra-prod-frontendbucket-qtg9tfwkus1z/ --delete

echo "Invalidating CloudFront..."
aws cloudfront create-invalidation \
  --distribution-id E2C1HS3K184GKW \
  --paths "/*"

echo "Done!"
