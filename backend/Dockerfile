# API y worker de REQUIEM CONTROL (misma imagen, distinto comando).
FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY requirements.txt .
# CA adicional OPCIONAL solo durante la compilación (redes corporativas con proxy); no queda en la imagen.
RUN --mount=type=secret,id=extra_ca,required=false \
    sh -c 'if [ -f /run/secrets/extra_ca ]; then export PIP_CERT=/run/secrets/extra_ca; fi; pip install -r requirements.txt'
COPY app ./app
COPY migrations ./migrations
COPY alembic.ini ./
# Usuario sin privilegios: el proceso nunca corre como root.
RUN useradd --system --uid 10001 --home /app requiem && chown -R requiem /app
USER requiem
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health').status==200 else 1)"
# Detrás de nginx: --proxy-headers para registrar la IP real (solo se confía en la red interna).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*", "--workers", "2"]
