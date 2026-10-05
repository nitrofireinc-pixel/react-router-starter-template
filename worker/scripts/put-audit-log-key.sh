#!/bin/sh
# Put AUDIT_LOG_KEY (or AUDIT_LOG_KEY_Kn) without ever assigning, printing,
# logging, or saving the random value. The bytes exist only in the openssl
# stdout → wrangler stdin pipe.
#
# Usage:
#   ./worker/scripts/put-audit-log-key.sh efhsband-dev
#   ./worker/scripts/put-audit-log-key.sh efhsband-dev k2
#   AUDIT_LOG_KEY_PROD_DEPLOY=1 ./worker/scripts/put-audit-log-key.sh efhsband-live
#
# Do not run the live worker unless this is the production deploy step.
set -eu

WORKER="${1:-}"
KEY_ID="${2:-k1}"

if [ "$WORKER" != "efhsband-dev" ] && [ "$WORKER" != "efhsband-live" ]; then
  echo "usage: $0 efhsband-dev|efhsband-live [k1|k2|...]" >&2
  exit 2
fi

if [ "$WORKER" = "efhsband-live" ] && [ "${AUDIT_LOG_KEY_PROD_DEPLOY:-}" != "1" ]; then
  echo "refusing to set the production secret until the prod deploy step" >&2
  exit 3
fi

SECRET_NAME="AUDIT_LOG_KEY"
if [ "$KEY_ID" != "k1" ]; then
  SECRET_NAME="AUDIT_LOG_KEY_$(printf '%s' "$KEY_ID" | tr '[:lower:]' '[:upper:]')"
fi

# CSPRNG → wrangler only. Do not capture, echo, or tee this stream.
openssl rand -base64 32 | wrangler secret put "$SECRET_NAME" --name "$WORKER"

# Names only. Never secret get / dump.
wrangler secret list --name "$WORKER"
