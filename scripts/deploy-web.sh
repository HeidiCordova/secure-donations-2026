#!/usr/bin/env bash
# Sube el build del frontend al bucket privado y limpia la caché de CloudFront (RNF-HU-01).
# Uso: scripts/deploy-web.sh [carpeta-del-build]   (por defecto frontend/dist)
set -euo pipefail

STACK="${STACK:-aqp-solidaria-academic}"
REGION="${AWS_REGION:-us-east-2}"
DIST="${1:-frontend/dist}"

if [[ ! -f "$DIST/index.html" ]]; then
  echo "No existe $DIST/index.html: corre antes 'npm run build' en frontend/" >&2
  exit 1
fi

out() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
BUCKET=$(out WebBucketName)
DIST_ID=$(out WebDistributionId)
URL=$(out WebUrl)

# Assets con hash en el nombre: caché larga. index.html: sin caché, para que cada deploy se vea al instante.
aws s3 sync "$DIST" "s3://$BUCKET" --delete --exclude index.html \
  --cache-control "public,max-age=31536000,immutable" --region "$REGION"
aws s3 cp "$DIST/index.html" "s3://$BUCKET/index.html" \
  --cache-control "no-cache" --content-type "text/html; charset=utf-8" --region "$REGION"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" \
  --query Invalidation.Id --output text

echo "Desplegado en $URL"
