#!/usr/bin/env bash
# Verifica que todo usuario de los grupos GESTOR y AUDITOR tenga MFA TOTP activo (CA-11.1).
# Control compensatorio: en Cognito el MFA se configura por pool (OPTIONAL), no por grupo.
# Uso: scripts/check-mfa.sh <user-pool-id>
set -euo pipefail

POOL_ID="${1:?Uso: scripts/check-mfa.sh <user-pool-id>}"
fail=0

for group in GESTOR AUDITOR; do
  users=$(aws cognito-idp list-users-in-group --user-pool-id "$POOL_ID" --group-name "$group" \
    --query 'Users[].Username' --output text)
  for user in $users; do
    mfa=$(aws cognito-idp admin-get-user --user-pool-id "$POOL_ID" --username "$user" \
      --query 'UserMFASettingList' --output text)
    if [[ "$mfa" == *SOFTWARE_TOKEN_MFA* ]]; then
      echo "OK    $group $user con MFA TOTP"
    else
      echo "FALLA $group $user sin MFA TOTP"
      fail=1
    fi
  done
done

exit "$fail"
