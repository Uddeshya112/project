# IntelliSchedule — production image (serves the API and the built frontend on one port).
# Build:  docker build -t intellischedule .
# Run:    docker run -p 8080:8080 --env-file .env intellischedule

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY supabase/migrations ./supabase/migrations
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:${PORT}/api/health/ready || exit 1
CMD ["node", "dist-server/server.mjs"]
