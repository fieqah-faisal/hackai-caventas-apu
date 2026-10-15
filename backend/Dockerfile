FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.prod.txt ./
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --default-timeout=120 --retries=10 -r requirements.prod.txt

COPY app ./app
COPY fixtures ./fixtures

RUN useradd --create-home --uid 10001 caventas \
    && mkdir -p uploads reports \
    && chown -R caventas:caventas /app

USER caventas

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
