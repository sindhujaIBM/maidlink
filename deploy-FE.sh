#!/bin/bash
set -e

ROOT="/Users/sindhuja/Desktop/maidlink"

echo "Building frontend..."
cd "$ROOT/frontend" && npm run build

echo "Syncing to S3..."
aws s3 sync dist/ s3://maidlink-infra-prod-frontendbucket-qtg9tfwkus1z/ --delete

echo "Invalidating CloudFront..."
aws cloudfront create-invalidation \
  --distribution-id E2C1HS3K184GKW \
  --paths "/*"

echo "Done!"