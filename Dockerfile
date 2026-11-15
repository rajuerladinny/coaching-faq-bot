# One container: builds the React app, then serves it and the API together.
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /srv/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=frontend /build/dist /srv/frontend/dist
# Run as an unprivileged user; /data holds the SQLite database.
RUN useradd --system --no-create-home app && mkdir /data && chown app /data
USER app
ENV STATIC_DIR=/srv/frontend/dist \
    DB_PATH=/data/faqbot.db \
    PORT=8000 \
    PYTHONUNBUFFERED=1
VOLUME /data
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/api/health', timeout=4)"
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
