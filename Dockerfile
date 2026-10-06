# Production backend image. Frontend is deployed separately to Vercel.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY . .
RUN npm run build
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:${PORT}/api/health/ready || exit 1
CMD ["npm","run","start"]
