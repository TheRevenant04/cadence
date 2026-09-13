FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /srv/api

COPY . .

RUN python -m venv /opt/venv \
    && pip install --upgrade pip \
    && pip install uv \
    && uv sync --group dev --no-install-project

EXPOSE 8000

ENTRYPOINT ["/srv/api/docker-entrypoint.sh"]
