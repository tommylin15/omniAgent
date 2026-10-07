FROM postgres:16.15-bookworm@sha256:bb3e1a57e5407e0a5280b4211980a5e537f4abd234a87014ac979849a78dd825

LABEL org.opencontainers.image.title="omniAgent PostgreSQL" \
      org.opencontainers.image.version="16.15" \
      org.opencontainers.image.source="https://github.com/tommylin15/omniAgent"

COPY postgresql.conf /opt/omniagent/postgresql.conf
COPY migrations /opt/omniagent/migrations
COPY readiness.sql /opt/omniagent/readiness.sql
