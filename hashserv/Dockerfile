FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# Rebuild trigger: 2026-08-07 - PostgreSQL backend + health check
RUN git clone --depth 1 https://git.openembedded.org/bitbake /opt/bitbake

# asyncpg: PostgreSQL async driver for SQLAlchemy backend
RUN pip install --no-cache-dir asyncpg sqlalchemy[asyncio]

ENV PYTHONPATH=/opt/bitbake/lib

COPY healthcheck.py /healthcheck.py
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8686 8687

ENTRYPOINT ["/entrypoint.sh"]
