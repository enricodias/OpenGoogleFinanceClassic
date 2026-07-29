FROM node:22.13.1-bookworm-slim AS development

WORKDIR /app

RUN npm install --global corepack@0.31.0 \
    && corepack enable \
    && corepack prepare pnpm@11.9.0 --activate

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile=false

COPY . .

EXPOSE 3000 5173

CMD ["pnpm", "dev"]

FROM development AS build

RUN pnpm build

FROM node:22.13.1-bookworm-slim AS production

WORKDIR /app

COPY --from=build /app /app

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "apps/api/dist/index.js"]
