#!/usr/bin/env bash
# Turns on "Continue with Google" for VentureOS (run on the server as root by deploy/windows/Set-VentureOS-Google.bat).
# VOS_B64 holds base64 of KEY=VALUE lines: VENTUREOS_GOOGLE_CLIENT_ID, VENTUREOS_GOOGLE_CLIENT_SECRET.
ENVF="${ENVF:-/etc/ventureos/ventureos.env}"
[ -f "$ENVF" ] || { echo "   MISSING: $ENVF - install VentureOS first."; exit 1; }
setenv() { { grep -v "^$1=" "$ENVF" 2>/dev/null; printf '%s=%s\n' "$1" "$2"; } > "$ENVF.new" && mv "$ENVF.new" "$ENVF" && chmod 600 "$ENVF"; }
unq() { local v="$1"; v="${v#\'}"; v="${v%\'}"; v="${v#\"}"; v="${v%\"}"; printf '%s' "$v"; }
getenv() { unq "$(grep -m1 "^$1=" "$ENVF" | cut -d= -f2-)"; }

echo; echo "== Turning on Sign in with Google"
vals=$(printf '%s' "$VOS_B64" | base64 -d | tr -d '\r')
get() { printf '%s\n' "$vals" | grep -m1 "^$1=" | cut -d= -f2- | tr -d ' '; }
ID=$(get VENTUREOS_GOOGLE_CLIENT_ID); SECRET=$(get VENTUREOS_GOOGLE_CLIENT_SECRET)
case "$ID" in *.apps.googleusercontent.com) ;; *) echo "   That Client ID does not look right (it should end in .apps.googleusercontent.com). Nothing changed."; exit 1;; esac
[ -n "$SECRET" ] || { echo "   No Client secret typed. Nothing changed."; exit 1; }

# Does Google know this client? A made-up code must be refused as invalid_grant, not invalid_client.
BASE=$(getenv VENTUREOS_BASE_URL); BASE=${BASE:-https://ventureos.africa}
R=$(curl -s -m 20 https://oauth2.googleapis.com/token -d "code=test&client_id=$ID&client_secret=$SECRET&redirect_uri=$BASE/signin/google/callback&grant_type=authorization_code")
if printf '%s' "$R" | grep -q invalid_client; then
  echo "   Google does NOT accept this Client ID and secret together (invalid_client). Copy both again from Google Cloud and run this again. Nothing changed."
  exit 1
fi
if [ -z "$R" ]; then echo "   (Could not reach Google from the server to check the keys - saving them anyway.)"
else echo "   Google recognises the Client ID and secret."; fi

setenv VENTUREOS_GOOGLE_CLIENT_ID "$ID"
setenv VENTUREOS_GOOGLE_CLIENT_SECRET "'$SECRET'"
systemctl restart ventureos && echo "   VentureOS restarted."
sleep 3
PORT=$(getenv PORT); PORT=${PORT:-4300}
if curl -s -m 10 "http://127.0.0.1:$PORT/signin" | grep -q "Continue with Google"; then
  echo "   DONE: the sign-in page now shows \"Continue with Google\" - $BASE/signin"
  echo "   The address Google must allow (Authorized redirect URI): $BASE/signin/google/callback"
else
  echo "   WARNING: the sign-in page does not show the Google button yet. Run Install-or-update-VentureOS.bat first, then this again."
fi
