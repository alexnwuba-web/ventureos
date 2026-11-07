#!/usr/bin/env bash
# Points VentureOS's email at a new mailbox (run on the server as root by deploy/windows/Set-VentureOS-email.bat).
# VOS_B64 holds base64 of KEY=VALUE lines: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.
set -e
ENVF="${ENVF:-/etc/ventureos/ventureos.env}"
[ -f "$ENVF" ] || { echo "   MISSING: $ENVF - install VentureOS first."; exit 1; }
setenv() { { grep -v "^$1=" "$ENVF" 2>/dev/null; printf '%s=%s\n' "$1" "$2"; } > "$ENVF.new" && mv "$ENVF.new" "$ENVF" && chmod 600 "$ENVF"; }
echo; echo "== Setting the VentureOS mailbox"
vals=$(printf '%s' "$VOS_B64" | base64 -d | tr -d '\r')
for k in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS; do
  v=$(printf '%s\n' "$vals" | grep -m1 "^$k=" | cut -d= -f2-)
  [ -n "$v" ] || { echo "   $k was empty - nothing changed."; exit 1; }
  setenv "$k" "$v"
done
u=$(printf '%s\n' "$vals" | grep -m1 '^SMTP_USER=' | cut -d= -f2-)
setenv SMTP_FROM "\"VentureOS <$u>\""
c=$(printf '%s\n' "$vals" | grep -m1 '^VENTUREOS_CONTACT=' | cut -d= -f2-)
if [ -n "$c" ]; then setenv VENTUREOS_CONTACT "$c"; echo "   Contact address on the site, and where replies go: $c"; fi
echo "   VentureOS now sends as: VentureOS <$u>"
systemctl restart ventureos && echo "   VentureOS restarted with the new mailbox."
