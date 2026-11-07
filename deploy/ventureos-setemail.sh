#!/usr/bin/env bash
# Points VentureOS's email at a mailbox (run on the server as root by deploy/windows/Set-VentureOS-email.bat).
# VOS_B64 holds base64 of KEY=VALUE lines: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, optional VENTUREOS_CONTACT.
# The new login is tested first; nothing is saved unless the mail server accepts it. If the settings in use do not
# work either, VentureOS goes back to the Oxi mailbox, so sign-in codes keep arriving.
ENVF="${ENVF:-/etc/ventureos/ventureos.env}"
APP="${APP:-/opt/apps/ventureos}"
[ -f "$ENVF" ] || { echo "   MISSING: $ENVF - install VentureOS first."; exit 1; }
setenv() { { grep -v "^$1=" "$ENVF" 2>/dev/null; printf '%s=%s\n' "$1" "$2"; } > "$ENVF.new" && mv "$ENVF.new" "$ENVF" && chmod 600 "$ENVF"; }
# Values are written in single quotes so symbols in a password ($ ! & # and the like) are kept exactly.
q() { printf "'%s'" "$1"; }
unq() { local v="$1"; v="${v#\'}"; v="${v%\'}"; v="${v#\"}"; v="${v%\"}"; printf '%s' "$v"; }
cur() { unq "$(grep -m1 "^$1=" "$ENVF" | cut -d= -f2-)"; }
# trylogin HOST PORT USER PASS -> prints OK or the server's reason
trylogin() { cd "$APP" && T_HOST="$1" T_PORT="$2" T_USER="$3" T_PASS="$4" node -e '
const nm = require("nodemailer"); const port = Number(process.env.T_PORT || 465);
nm.createTransport({ host: process.env.T_HOST, port, secure: port === 465, auth: { user: process.env.T_USER, pass: process.env.T_PASS }, connectionTimeout: 15000 })
  .verify().then(() => console.log("OK"), (e) => console.log(e.message));' 2>&1; }
save() { setenv SMTP_HOST "$1"; setenv SMTP_PORT "$2"; setenv SMTP_USER "$3"; setenv SMTP_PASS "$(q "$4")"; setenv SMTP_FROM "\"VentureOS <$3>\""; }

echo; echo "== Setting the VentureOS mailbox"
vals=$(printf '%s' "$VOS_B64" | base64 -d | tr -d '\r')
get() { printf '%s\n' "$vals" | grep -m1 "^$1=" | cut -d= -f2-; }
H=$(get SMTP_HOST); P=$(get SMTP_PORT); U=$(get SMTP_USER); W=$(get SMTP_PASS); C=$(get VENTUREOS_CONTACT)
if [[ "$W" == *"'"* ]]; then echo "   The password contains an apostrophe ('). Please change it in Hostinger to one without, then run this again. Nothing changed."; exit 1; fi
r=$(trylogin "$H" "$P" "$U" "$W")
if [ "$r" = "OK" ]; then
  save "$H" "$P" "$U" "$W"
  echo "   Hostinger accepted the login for $U. VentureOS now sends as: VentureOS <$U>"
  if [ -n "$C" ]; then setenv VENTUREOS_CONTACT "$C"; echo "   Contact address on the site, and where replies go: $C"; fi
  systemctl restart ventureos && echo "   VentureOS restarted."
  exit 0
fi
echo "   The mail server REFUSED the login for $U: $r"
echo "   Nothing was changed. Check the password in Hostinger (Emails > ventureos.africa > Mailboxes > change password) and run this again."
# Do the settings in use still work? If not, go back to the Oxi mailbox so sign-in codes keep arriving.
r2=$(trylogin "$(cur SMTP_HOST)" "$(cur SMTP_PORT)" "$(cur SMTP_USER)" "$(cur SMTP_PASS)")
if [ "$r2" = "OK" ]; then echo "   The settings in use ($(cur SMTP_USER)) still work."; exit 1; fi
echo "   The settings in use ($(cur SMTP_USER)) do not work either ($r2)."
for f in $(ls /opt/apps/oxigroup/.env /opt/apps/oxigroup/apps/*/.env /opt/oxi-platform/deploy/.env /etc/oxi*/*.env 2>/dev/null); do
  oh=$(unq "$(grep -m1 '^SMTP_HOST=' "$f" | cut -d= -f2-)"); [ -n "$oh" ] || continue
  op=$(unq "$(grep -m1 '^SMTP_PORT=' "$f" | cut -d= -f2-)"); ou=$(unq "$(grep -m1 '^SMTP_USER=' "$f" | cut -d= -f2-)"); ow=$(unq "$(grep -m1 '^SMTP_PASS=' "$f" | cut -d= -f2-)")
  if [ "$(trylogin "$oh" "${op:-465}" "$ou" "$ow")" = "OK" ]; then
    save "$oh" "${op:-465}" "$ou" "$ow"; systemctl restart ventureos
    echo "   Switched back to the Oxi mailbox ($ou, from $f) so sign-in codes keep arriving."
    exit 1
  fi
done
echo "   WARNING: no working mailbox found. Sign-in codes cannot be emailed until a working password is set."
exit 1
