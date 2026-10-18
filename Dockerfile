# Modo contínuo (VPS, Oracle Cloud Always Free, Raspberry Pi...):
#   docker build -t radar-ofertas .
#   docker run -d --restart unless-stopped --env-file .env -v radar-dados:/dados radar-ofertas
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
ENV RADAR_DB=/dados/ofertas.db
VOLUME ["/dados"]
CMD ["node", "src/cli.js", "loop", "10"]
