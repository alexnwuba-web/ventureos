#!/usr/bin/env bash
# Installs or updates VentureOS on the Lagos server, with its own PostgreSQL database. Safe to run again: every
# step checks what is already there. Run by "Install-or-update-VentureOS.bat", which sends the code to /tmp/ventureos-src
# and then runs:   sudo DOMAIN=<web address or empty> bash /tmp/ventureos-src/deploy/ventureos-setup.sh
set -o pipefail
SRC=/tmp/ventureos-src
APP=/opt/apps/ventureos
ENVDIR=/etc/ventureos
ENVF=$ENVDIR/ventureos.env
DATA=/var/lib/ventureos
IP=102.204.2.229
EMAIL=alex@scalegate.org        # for HTTPS certificate notices
say() { echo; echo "== $*"; }
fail() { echo; echo "FAILED: $*"; exit 1; }
setenv() { # setenv KEY VALUE  (adds or replaces a line in the settings file; safe for any characters)
  { grep -v "^$1=" "$ENVF" 2>/dev/null; printf '%s=%s\n' "$1" "$2"; } > "$ENVF.new" && mv "$ENVF.new" "$ENVF" && chmod 600 "$ENVF"
}
getenv() { grep -m1 "^$1=" "$ENVF" 2>/dev/null | cut -d= -f2-; }

[ -f "$SRC/package.json" ] || fail "the VentureOS code did not arrive on the server ($SRC)."
mkdir -p "$ENVDIR" "$DATA/uploads" /var/backups/ventureos
touch "$ENVF"; chmod 600 "$ENVF"

say "1. Web address"
[ -n "$DOMAIN" ] || DOMAIN=$(getenv VENTUREOS_DOMAIN)
DOMAIN=$(echo "$DOMAIN" | tr 'A-Z' 'a-z' | sed 's#^https\?://##; s#/.*$##; s/ //g')
[ -n "$DOMAIN" ] || fail "no web address given. Run the file again and type the address (for example ventureos.scalegate.org)."
setenv VENTUREOS_DOMAIN "$DOMAIN"
echo "   $DOMAIN"

say "2. Node.js"
NODE=$(command -v node || true)
[ -n "$NODE" ] || fail "Node.js is not installed on the server (the Oxi apps use it, so this is unexpected)."
major=$("$NODE" -v | sed 's/^v//; s/\..*//')
[ "$major" -ge 20 ] || fail "Node.js $("$NODE" -v) is too old; VentureOS needs 20 or newer."
echo "   $("$NODE" -v) at $NODE"

say "3. VentureOS's own database (PostgreSQL)"
if ! command -v pg_lsclusters >/dev/null 2>&1; then
  echo "   Installing PostgreSQL (first time only)..."
  DEBIAN_FRONTEND=noninteractive apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql >/dev/null || fail "PostgreSQL could not be installed."
fi
# The first cluster on this machine (PostgreSQL picks a free port, e.g. 5433 if Supabase already uses 5432).
read -r PGVER PGCLUSTER PGPORT PGSTATUS _ < <(pg_lsclusters --no-header | head -1)
[ -n "$PGPORT" ] || fail "no PostgreSQL cluster found."
if [ "$PGSTATUS" != "online" ]; then pg_ctlcluster "$PGVER" "$PGCLUSTER" start || fail "PostgreSQL would not start."; fi
systemctl enable postgresql >/dev/null 2>&1 || true
echo "   PostgreSQL $PGVER on port $PGPORT (local connections only)"
DBPASS=$(getenv VENTUREOS_DB_PASSWORD)
[ -n "$DBPASS" ] || { DBPASS=$(openssl rand -hex 24); setenv VENTUREOS_DB_PASSWORD "$DBPASS"; }
psql_() { sudo -u postgres psql -p "$PGPORT" -v ON_ERROR_STOP=1 -qtAc "$1"; }
if [ "$(psql_ "SELECT 1 FROM pg_roles WHERE rolname='ventureos'")" = 1 ]; then psql_ "ALTER ROLE ventureos WITH LOGIN PASSWORD '$DBPASS'" >/dev/null
else psql_ "CREATE ROLE ventureos WITH LOGIN PASSWORD '$DBPASS'" >/dev/null || fail "could not create the database user."; fi
if [ "$(psql_ "SELECT 1 FROM pg_database WHERE datname='ventureos'")" != 1 ]; then
  psql_ "CREATE DATABASE ventureos OWNER ventureos" >/dev/null || fail "could not create the database."
  echo "   Created the database 'ventureos'."
else echo "   Database 'ventureos' already there."; fi
psql_ "ALTER DATABASE ventureos OWNER TO ventureos" >/dev/null || fail "could not give the database to the ventureos user."
psql_ "REVOKE ALL ON DATABASE ventureos FROM PUBLIC" >/dev/null || true
psql_ "GRANT ALL ON DATABASE ventureos TO ventureos" >/dev/null || true
sudo -u postgres psql -p "$PGPORT" -d ventureos -qtAc "CREATE EXTENSION IF NOT EXISTS pgcrypto" >/dev/null || fail "could not add the pgcrypto extension."
setenv VENTUREOS_DATABASE_URL "postgres://ventureos:$DBPASS@127.0.0.1:$PGPORT/ventureos"

say "4. Settings"
[ -n "$(getenv VENTUREOS_SESSION_SECRET)" ] || setenv VENTUREOS_SESSION_SECRET "$(openssl rand -hex 32)"
setenv NODE_ENV production
setenv VENTUREOS_BASE_URL "https://$DOMAIN"
setenv VENTUREOS_UPLOADS "$DATA/uploads"
[ -n "$(getenv VENTUREOS_ADMINS)" ] || setenv VENTUREOS_ADMINS "alex@scalegate.org,alexnwuba@gmail.com"
PORT=$(getenv PORT)
if [ -z "$PORT" ]; then
  PORT=4300; while ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$PORT$"; do PORT=$((PORT+1)); done
  setenv PORT "$PORT"
fi
echo "   VentureOS will listen on 127.0.0.1:$PORT"
# Email for sign-in codes: borrow the Oxi apps' mail settings the first time, if VentureOS has none.
if [ -z "$(getenv SMTP_HOST)" ]; then
  cands=$(ls /opt/apps/oxigroup/.env /opt/apps/oxigroup/apps/*/.env /opt/oxi-platform/deploy/.env /etc/oxi*/*.env 2>/dev/null)
  for u in $(systemctl list-units --type=service --all --no-legend --plain 2>/dev/null | grep -oiE '^[^ ]*oxi[^ ]*\.service'); do
    f=$(systemctl show -p EnvironmentFiles "$u" 2>/dev/null | sed 's/^EnvironmentFiles=//; s/ (.*//'); [ -n "$f" ] && cands="$cands $f"
  done
  for f in $cands; do
    h=$(grep -m1 '^SMTP_HOST=' "$f" 2>/dev/null | cut -d= -f2- | tr -d '"')
    if [ -n "$h" ]; then
      for k in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS; do v=$(grep -m1 "^$k=" "$f" | cut -d= -f2- | tr -d '"'); [ -n "$v" ] && setenv "$k" "$v"; done
      from=$(grep -m1 '^SMTP_FROM=' "$f" | cut -d= -f2- | tr -d '"' | grep -oE '[^< ]+@[^> ]+' || true)
      [ -n "$from" ] || from=$(getenv SMTP_USER)
      setenv SMTP_FROM "\"VentureOS <$from>\""
      echo "   Email: using the Oxi mail settings from $f (sending as $from)."
      break
    fi
  done
fi
if [ -z "$(getenv SMTP_HOST)" ]; then
  echo "   WARNING: no email settings found. Sign-in codes cannot be emailed until SMTP_HOST, SMTP_PORT, SMTP_USER,"
  echo "   SMTP_PASS and SMTP_FROM are added to $ENVF. (Until then the codes are only written to the server log.)"
fi

say "5. The code"
id ventureos >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin ventureos
mkdir -p "$APP"
before=$(cat "$APP/.version" 2>/dev/null || echo none)
# Copy the new code over, keeping installed packages when the lock file has not changed.
tar -C "$SRC" --exclude=node_modules --exclude=uploads --exclude=.git -cf - . | tar -C "$APP" -xf - || fail "could not copy the code."
cd "$APP" || fail "$APP missing."
lock=$(sha256sum package-lock.json | cut -c1-16)
if [ ! -d node_modules ] || [ "$(cat .installed 2>/dev/null)" != "$lock" ]; then
  echo "   Installing packages..."
  npm ci --omit=dev --no-audit --no-fund >/tmp/ventureos-npm.log 2>&1 || { tail -20 /tmp/ventureos-npm.log; fail "packages could not be installed."; }
  echo "$lock" > .installed
fi
date +%Y%m%d%H%M%S > .version
chown -R ventureos:ventureos "$APP" "$DATA"
echo "   Code in $APP (was version $before, now $(cat .version))"

say "6. The VentureOS service"
cat > /etc/systemd/system/ventureos.service <<UNIT
[Unit]
Description=VentureOS (ScaleGate Africa)
After=network.target postgresql.service

[Service]
User=ventureos
WorkingDirectory=$APP
EnvironmentFile=$ENVF
ExecStart=$NODE src/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$DATA

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable ventureos >/dev/null 2>&1
systemctl restart ventureos
ok=0
for i in $(seq 1 30); do sleep 2; [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/health" || echo 000)" = 200 ] && { ok=1; break; }; done
[ "$ok" = 1 ] || { journalctl -u ventureos -n 30 --no-pager; fail "VentureOS did not start (see the lines above)."; }
echo "   Running."

say "7. Daily backup (database and uploaded documents, kept 14 days)"
cat > /etc/cron.daily/ventureos-backup <<CRON
#!/bin/sh
d=\$(date +%Y%m%d)
sudo -u postgres pg_dump -p $PGPORT ventureos | gzip > /var/backups/ventureos/ventureos-db-\$d.sql.gz
tar -czf /var/backups/ventureos/ventureos-uploads-\$d.tar.gz -C $DATA uploads
find /var/backups/ventureos -type f -mtime +14 -delete
CRON
chmod 755 /etc/cron.daily/ventureos-backup
echo "   /var/backups/ventureos"

say "8. $DOMAIN on the web (HTTPS)"
got=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')
if ! echo " $got " | grep -q " $IP "; then
  echo "   $DOMAIN points to: ${got:-nothing yet} (should be $IP)."
  echo
  echo "VENTUREOS IS INSTALLED, BUT NOT YET ON THE WEB: add an A record for $DOMAIN pointing to $IP at the domain's"
  echo "DNS, wait 15 to 60 minutes, then run this file again."
  exit 0
fi
echo "   $DOMAIN -> $IP (good)"
if systemctl is-active --quiet caddy 2>/dev/null && [ -f /etc/caddy/Caddyfile ]; then
  CF=/etc/caddy/Caddyfile
  if grep -qE "(^|[ ,])$(echo "$DOMAIN" | sed 's/\./\\./g')([ ,{]|$)" "$CF"; then echo "   $DOMAIN is already in Caddy."
  else
    BACKUP="$CF.before-ventureos.$(date +%Y%m%d%H%M%S)"; cp "$CF" "$BACKUP"
    printf '\n# VentureOS (ScaleGate Africa), added %s\n%s {\n\trequest_body {\n\t\tmax_size 25MB\n\t}\n\treverse_proxy 127.0.0.1:%s\n}\n' "$(date +%F)" "$DOMAIN" "$PORT" >> "$CF"
    caddy validate --config "$CF" --adapter caddyfile >/dev/null 2>&1 || { cp "$BACKUP" "$CF"; fail "the Caddy settings did not check out; the old file was put back."; }
  fi
  systemctl reload caddy && echo "   Caddy reloaded; it fetches the HTTPS certificate itself."
elif systemctl is-active --quiet nginx 2>/dev/null; then
  if [ ! -f /etc/nginx/sites-available/ventureos ] || ! grep -q "server_name $DOMAIN;" /etc/nginx/sites-available/ventureos; then
    cat > /etc/nginx/sites-available/ventureos <<NGINX
# VentureOS (ScaleGate Africa). HTTPS is added by certbot.
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    client_max_body_size 25m;
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 120s;
    }
}
NGINX
    ln -sf /etc/nginx/sites-available/ventureos /etc/nginx/sites-enabled/ventureos
  fi
  nginx -t >/dev/null 2>&1 || { nginx -t; rm -f /etc/nginx/sites-enabled/ventureos; fail "the nginx settings do not check out."; }
  systemctl reload nginx
  command -v certbot >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq certbot python3-certbot-nginx >/dev/null; }
  if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then certbot --nginx -n --agree-tos -m "$EMAIL" --redirect -d "$DOMAIN" || fail "the HTTPS certificate could not be issued."; fi
  systemctl reload nginx
else
  fail "neither Caddy nor nginx is running on the server."
fi

say "9. Check"
code=000
for i in $(seq 1 24); do code=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/health" || echo 000); [ "$code" = 200 ] && break; sleep 5; done
echo "   https://$DOMAIN/health answered $code"
[ "$code" = 200 ] || fail "the site does not answer over HTTPS yet. Wait 10 minutes and run this file again."
echo "   https://$DOMAIN/ answered $(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/" || echo 000)"
echo
echo "VENTUREOS IS LIVE at https://$DOMAIN"
