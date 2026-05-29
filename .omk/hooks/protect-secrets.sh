#!/usr/bin/env bash
# Secret/environment variable protection
set -e

# Close security gate if jq/python3 is missing (deny by default)
if command -v python3 &>/dev/null; then
  PY=python3
elif command -v python &>/dev/null; then
  PY=python
else
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"python3 not installed — protect-secrets cannot validate files"}}'
  exit 0
fi

INPUT=$(cat)
FILEPATH=$(echo "$INPUT" | $PY -c 'import sys,json; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("file_path",""))')
CONTENT=$(echo "$INPUT" | $PY -c 'import sys,json; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("content",""))')

# Block direct modification of sensitive files
SENSITIVE_PATHS=(".env" ".pem" ".key" "id_rsa" "id_ed25519" "credentials" "service-account" ".p12" ".pfx" ".keystore")
for sp in "${SENSITIVE_PATHS[@]}"; do
  if [[ "$FILEPATH" == *"$sp"* ]]; then
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Direct modification of sensitive file blocked: '"$sp"'"}}'
    exit 0
  fi
done

# Keyword detection (JWT, cloud tokens, private keys, etc.)
if echo "$CONTENT" | grep -qiE '(password|secret|api_key|auth|bearer|token|private_key|aws_access_key_id|aws_secret_access_key|akiai|asiai|ghp_|github_pat|sk-|glpat-|npm_|pypi_|docker_auth|private.?key|BEGIN .* PRIVATE KEY|ssh-rsa|ssh-ed25519)'; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Potential secret leak detected"}}'
  exit 0
fi

echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
