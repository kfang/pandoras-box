FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /mnemosyne ./cmd/mnemosyne

FROM alpine:3.21
RUN apk add --no-cache exiftool ffmpeg
COPY --from=build /mnemosyne /usr/local/bin/mnemosyne
COPY web/ /app/web/
WORKDIR /app

ENV MNEMOSYNE_IMPORT_DIR=/data/import
ENV MNEMOSYNE_LIBRARY_DIR=/data/library
ENV MNEMOSYNE_ADDR=:8080
ENV MNEMOSYNE_WORKERS=4

VOLUME /data

EXPOSE 8080
ENTRYPOINT ["mnemosyne"]
