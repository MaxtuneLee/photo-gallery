FROM node:lts AS build
WORKDIR /app
COPY package*.json ./
RUN corepack enable
RUN pnpm install
COPY . .
RUN pnpm build:manifest
RUN pnpm build

FROM nginx:alpine AS runtime
COPY ./nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
# COPY --from=build /app /usr/share/nginx/app
EXPOSE 8081