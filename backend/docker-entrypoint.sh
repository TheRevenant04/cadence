#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="postgresql+asyncpg://cadence:cadence@db:5432/cadence"
fi

echo "Running Alembic migrations"
uv run alembic upgrade head

echo "Seeding demo data (idempotent)"
uv run python -m app.seed

echo "Starting Cadence API"
exec uv run uvicorn app.app:app --host 0.0.0.0 --port "${PORT:-8000}"