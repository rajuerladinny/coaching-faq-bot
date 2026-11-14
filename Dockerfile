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
RUN pip install --no-cache-dir fastapi "uvicorn[standard]"
COPY backend/app ./app
COPY --from=frontend /build/dist /srv/frontend/dist
ENV STATIC_DIR=/srv/frontend/dist \
    DB_PATH=/data/faqbot.db \
    PORT=8000
VOLUME /data
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
