FROM golang:1.26-alpine AS build
WORKDIR /workspace/backend/api
COPY backend/api/go.mod ./
COPY backend/api/go.sum ./
RUN go mod download
COPY backend/api ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/api ./cmd/api

FROM alpine:3.23
WORKDIR /app
COPY --from=build /out/api /app/api
EXPOSE 8080
CMD ["/app/api"]
