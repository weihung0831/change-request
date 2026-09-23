FROM node:25-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:25-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data
RUN mkdir -p /data/images && chown -R node:node /data
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "build"]
