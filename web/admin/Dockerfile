FROM node:22-alpine AS builder

WORKDIR /workspace

RUN corepack enable \
    && corepack prepare pnpm@10.12.1 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY admin ./admin
COPY packages ./packages
COPY tsconfig.base.json ./

RUN pnpm install --filter panda-wiki-admin --frozen-lockfile \
    && pnpm --filter panda-wiki-admin build

FROM nginx:alpine

COPY --from=builder /workspace/admin/dist /opt/frontend/dist
COPY admin/server.conf /etc/nginx/conf.d/server.conf
COPY admin/nginx.conf /etc/nginx/nginx.conf
COPY admin/ssl /etc/nginx/ssl

RUN chown -R nginx:nginx /opt/frontend/dist \
    && find /opt/frontend/dist -type d -exec chmod 755 {} + \
    && find /opt/frontend/dist -type f -exec chmod 644 {} +

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
