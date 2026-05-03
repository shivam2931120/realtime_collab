FROM node:22-alpine AS deps

WORKDIR /app
COPY package*.json ./
# Try a reproducible install with `npm ci`, but fall back to a plain `npm install`
# if the environment prevents `npm ci` from completing in some CI/Docker images.
RUN npm ci || npm install --no-audit --no-fund --prefer-offline

FROM deps AS build
WORKDIR /app
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# Use `npm ci --omit=dev` in production, but fall back to `npm install --omit=dev`
# for environments where `npm ci` fails (permissions, npm version quirks, etc.).
RUN npm ci --omit=dev || npm install --omit=dev --no-audit --no-fund --prefer-offline
COPY --from=build /app/dist ./dist
EXPOSE 5000
CMD ["npm", "run", "start"]
