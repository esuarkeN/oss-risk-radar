FROM node:26-alpine AS build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace
COPY package.json ./package.json
COPY package-lock.json ./package-lock.json
COPY shared/packages/schemas ./shared/packages/schemas
COPY frontend/web ./frontend/web
RUN npm ci
RUN npm run build --workspace @oss-risk-radar/web

FROM node:26-alpine AS runner
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=build /workspace/frontend/web/.next/standalone ./
COPY --from=build /workspace/frontend/web/.next/static ./frontend/web/.next/static
COPY --from=build /workspace/frontend/web/public ./frontend/web/public
EXPOSE 3000
CMD ["node", "frontend/web/server.js"]
