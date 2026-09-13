#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="postgresql+asyncpg://cadence:cadence@db:5432/cadence"
fi

echo "Running Alembic migrations"
alembic upgrade head

echo "Seeding demo data (idempotent)"
uv run python -m app.seed

echo "Starting Cadence API"
exec uvicorn app.app:app --host 0.0.0.0 --port "${PORT:-8000}"
