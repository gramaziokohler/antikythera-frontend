# ---- Build stage ----
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# VITE_ env vars are embedded at build time.
# VITE_MQTT_BROKER_HOST is the MQTT broker hostname the browser will use.
# Defaults to "mqtt-broker" (Docker service name) so orchestrator connections
# resolve correctly on the Docker network. Override at build time if needed.
ARG VITE_MQTT_BROKER_HOST=mqtt-broker
ENV VITE_MQTT_BROKER_HOST=$VITE_MQTT_BROKER_HOST

ARG VITE_MQTT_BROKER_PORT=1883
ENV VITE_MQTT_BROKER_PORT=$VITE_MQTT_BROKER_PORT

RUN npm run build

# ---- Serve stage ----
FROM nginx:stable-alpine

LABEL \
    org.opencontainers.image.authors="Chen Kasirer <kasirer@arch.ethz.ch>" 

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
