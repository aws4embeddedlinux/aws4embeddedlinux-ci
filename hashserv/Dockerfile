FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://git.openembedded.org/bitbake /opt/bitbake

ENV PYTHONPATH=/opt/bitbake/lib

EXPOSE 8686

ENTRYPOINT ["/opt/bitbake/bin/bitbake-hashserv"]
CMD ["--bind", "0.0.0.0:8686", "--database", "/data/hashserv.db", "--log", "INFO"]
