FROM node:22-alpine

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

WORKDIR /workspace

RUN corepack enable \
    && corepack prepare pnpm@10.12.1 --activate

COPY --chown=nextjs:nodejs pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY --chown=nextjs:nodejs app ./app
COPY --chown=nextjs:nodejs packages ./packages
COPY --chown=nextjs:nodejs tsconfig.base.json ./
RUN pnpm install --filter panda-wiki-app --frozen-lockfile \
    && cd app \
    && pnpm run build \
    && pnpm prune --prod

FROM node:22-alpine

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY --from=0 /workspace/app/dist/standalone/app ./app
COPY --from=0 /workspace/app/dist/static ./app/dist/static
COPY --from=0 /workspace/app/public ./app/public

USER nextjs
EXPOSE 3010
ENV PORT=3010
ENV HOSTNAME="0.0.0.0"

CMD ["node", "app/server.js"]
