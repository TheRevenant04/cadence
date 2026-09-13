FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /srv/backend

COPY pyproject.toml uv.lock ./

RUN pip install --upgrade pip uv \
    && uv sync --group dev --no-install-project

COPY . .

EXPOSE 8000

ENTRYPOINT ["/srv/backend/docker-entrypoint.sh"]