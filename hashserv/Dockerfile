FROM python:3.12-slim

RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# Rebuild trigger: 2026-09-30 - Security update: resolve container vulnerability findings
RUN git clone --depth 1 https://git.openembedded.org/bitbake /opt/bitbake

# asyncpg: PostgreSQL async driver for SQLAlchemy backend
RUN pip install --no-cache-dir asyncpg==0.31.0 sqlalchemy[asyncio]==2.1.1

ENV PYTHONPATH=/opt/bitbake/lib

COPY healthcheck.py /healthcheck.py
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8686 8687

ENTRYPOINT ["/entrypoint.sh"]
