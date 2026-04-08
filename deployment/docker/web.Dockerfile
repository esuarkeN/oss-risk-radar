FROM node:22-alpine
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace
COPY package.json ./package.json
COPY package-lock.json ./package-lock.json
COPY shared/packages/schemas ./shared/packages/schemas
COPY frontend/web ./frontend/web
RUN npm ci
RUN npm run build --workspace @oss-risk-radar/web
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@oss-risk-radar/web"]