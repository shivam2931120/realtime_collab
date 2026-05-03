FROM node:22-alpine AS deps

WORKDIR /app
COPY package*.json ./
# Ensure npm can run installs inside some Docker environments where permission
# handling causes `npm ci` to fail. Set unsafe-perm, then try `npm ci`, falling
# back to `npm install` if necessary.
RUN npm config set unsafe-perm true && (npm ci || npm install --no-audit --no-fund --prefer-offline)

FROM deps AS build
WORKDIR /app
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# Same fallback behavior for production install
RUN npm config set unsafe-perm true && (npm ci --omit=dev || npm install --omit=dev --no-audit --no-fund --prefer-offline)
COPY --from=build /app/dist ./dist
EXPOSE 5000
CMD ["npm", "run", "start"]
