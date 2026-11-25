# IntelliSchedule — production image (serves the API and the built frontend on one port).
# Build:  docker build -t intellischedule .
# Run:    docker run -p 8080:8080 --env-file .env intellischedule

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server.ts tsconfig.json ./
COPY src ./src
COPY supabase/migrations ./supabase/migrations
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:${PORT}/api/health/ready || exit 1
# tsx runs the server directly; there is no separate server bundle.
CMD ["node", "--import", "tsx", "server.ts"]
