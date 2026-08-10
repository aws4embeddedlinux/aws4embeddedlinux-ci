#!/bin/sh
# Start the health check server in the background
python3 /healthcheck.py &

# Construct the database URL from environment variables
DB_URL="postgresql+asyncpg://${DB_USER}:${DB_PASS}@${DB_HOST}/${DB_NAME}"

# Start the hashserv (foreground - container lifecycle tied to this process)
exec /opt/bitbake/bin/bitbake-hashserv \
  --bind "0.0.0.0:8686" \
  --database "$DB_URL" \
  --log "${LOG_LEVEL:-INFO}"
