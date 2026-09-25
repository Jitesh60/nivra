# syntax=docker/dockerfile:1
# Sajha API image. Build from the repository root:
#   docker build -f apps/api/Dockerfile --build-arg GIT_SHA=$(git rev-parse HEAD) -t sajha-api .
# The same image runs two services (docs/DEPLOY.md):
#   api    — JOBS_WORKER=false, public, pre-deploy `node_modules/.bin/prisma migrate deploy`
#   worker — JOBS_WORKER=true, no public domain

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS build
ARG PNPM_VERSION=10.33.0
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /repo
# Dependencies first, so source edits reuse the install layer.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
COPY apps/api/package.json apps/api/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @sajha/api... --ignore-scripts=false
COPY packages/tsconfig packages/tsconfig
COPY apps/api apps/api
RUN pnpm --filter @sajha/api build
# Production dependencies only, as a self-contained folder.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm --filter @sajha/api deploy --prod --legacy /out \
 && rm -rf /out/src /out/test /out/coverage \
 && cp -r apps/api/dist /out/dist

FROM node:${NODE_VERSION}-bookworm-slim AS run
ARG GIT_SHA=dev
ENV NODE_ENV=production \
    PORT=3000 \
    GIT_SHA=${GIT_SHA}
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/v1/health/live').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/main.js"]
