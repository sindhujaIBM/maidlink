#!/bin/bash
set -e

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

echo "Deploying auth..."
cd /Users/sindhuja/Desktop/maidlink/services/auth
npx serverless deploy --stage prod

echo "Deploying users..."
cd /Users/sindhuja/Desktop/maidlink/services/users
npx serverless deploy --stage prod

echo "Deploying booking..."
cd /Users/sindhuja/Desktop/maidlink/services/booking
npx serverless deploy --stage prod

echo "Deploying admin..."
cd /Users/sindhuja/Desktop/maidlink/services/admin
npx serverless deploy --stage prod

echo "All services deployed!"
