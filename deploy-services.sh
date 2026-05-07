#!/bin/bash
# Usage:
#   ./deploy-services.sh           — deploy all services + frontend
#   ./deploy-services.sh users     — deploy only the users service
#   ./deploy-services.sh auth|booking|admin — deploy only that service
set -e

ROOT="/Users/sindhuja/Desktop/maidlink"
TARGET="${1:-all}"   # first arg selects service, default = all

# ── Secrets ───────────────────────────────────────────────────────────────────
SECRET=$(aws secretsmanager get-secret-value \
  --secret-id /maidlink/prod/rds-credentials \
  --region ca-west-1 --query SecretString --output text)

export DB_HOST="maidlink-postgres-prod.cspqotkdhyca.ca-west-1.rds.amazonaws.com"
export DB_PORT="5432"
export DB_NAME="maidlink"
export DB_USER=$(echo $SECRET | python3 -c "import sys,json; print(json.load(sys.stdin)['username'])")
export DB_PASSWORD=$(echo $SECRET | python3 -c "import sys,json; print(json.load(sys.stdin)['password'])")
export DB_SSL="true"
export PHOTOS_BUCKET="maidlink-infra-prod-photosbucket-f9zualsqxenk"
export SES_CONFIG_SET="MaidlinkConfigSet-prod"
export CORS_ORIGIN="https://maidlink.ca"

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
deploy_service() {
  echo "Deploying $1..."
  cd "$ROOT/services/$1" && npx serverless deploy --stage prod
}

if [[ "$TARGET" == "all" ]]; then
  deploy_service auth
  deploy_service users
  deploy_service booking
  deploy_service admin
else
  deploy_service "$TARGET"
fi

# ── Skip cleanup + frontend for single-service deploys ───────────────────────
[[ "$TARGET" != "all" ]] && echo "Done!" && exit 0

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
