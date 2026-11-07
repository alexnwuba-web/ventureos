#!/usr/bin/env bash
# VentureOS email check (run on the server as root by deploy/windows/Check-VentureOS-email.bat).
# Shows the email settings, recent email errors, sends a test email, and gives a sign-in code for SIGNIN_EMAIL.
APP="${APP:-/opt/apps/ventureos}"
ENVF="${ENVF:-/etc/ventureos/ventureos.env}"
TO="${SIGNIN_EMAIL:-alex@scalegate.org}"
echo; echo "== 1. Email settings in $ENVF"
if [ ! -f "$ENVF" ]; then echo "   MISSING: $ENVF"; exit 1; fi
for k in SMTP_HOST SMTP_PORT SMTP_USER SMTP_FROM; do echo "   $k = $(grep -m1 "^$k=" "$ENVF" | cut -d= -f2-)"; done
p=$(grep -m1 '^SMTP_PASS=' "$ENVF" | cut -d= -f2-); echo "   SMTP_PASS = $( [ -n "$p" ] && echo "(set, ${#p} characters)" || echo '(EMPTY)')"
echo; echo "== 2. Email lines in the VentureOS log (last 6 hours)"
journalctl -u ventureos --since "6 hours ago" --no-pager 2>/dev/null | grep -i "\[mail\]" | grep -v "is your VentureOS sign-in code" | tail -15 | sed 's/^/   /'
[ "${PIPESTATUS[1]}" = "0" ] || echo "   (no email lines)"
echo; echo "== 3. Test: connect to the mail server and send a test email to $TO"
cd "$APP" && set -a && . "$ENVF" && set +a && SIGNIN_EMAIL="$TO" node -e '
const nodemailer = require("nodemailer");
const port = Number(process.env.SMTP_PORT || 587);
const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465,
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined, connectionTimeout: 15000 });
(async () => {
  try { await t.verify(); console.log("   Connected and logged in to " + process.env.SMTP_HOST + ":" + port + " - OK"); }
  catch (e) { console.log("   CANNOT LOG IN / CONNECT: " + e.message); }
  try {
    const r = await t.sendMail({ from: process.env.SMTP_FROM, to: process.env.SIGNIN_EMAIL, subject: "VentureOS test email", text: "If you can read this, VentureOS can send email." });
    console.log("   Test email ACCEPTED by the mail server: " + (r.response || "ok"));
    if (r.rejected && r.rejected.length) console.log("   but REJECTED for: " + r.rejected.join(", "));
  } catch (e) { console.log("   Test email FAILED: " + e.message); }
  // A sign-in code that works for 10 minutes, so you can get in while email is being fixed.
  try {
    const auth = require("./src/auth");
    const { code } = await auth.sendCode(process.env.SIGNIN_EMAIL);
    console.log("\n== 4. Sign-in code for " + process.env.SIGNIN_EMAIL + " (works for 10 minutes): " + code);
  } catch (e) { console.log("\n== 4. Could not make a sign-in code: " + e.message); }
  setTimeout(() => process.exit(0), 500);
})();' 2>&1 | grep -v "is your VentureOS sign-in code\|^\[mail\]\|^Your sign-in code\|^It works for 10\|^VentureOS · \|^18A \|^scalegate\|^$"
echo; echo "== Done."
