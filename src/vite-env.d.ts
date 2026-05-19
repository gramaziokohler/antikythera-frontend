/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MQTT_BROKER_HOST: string
  readonly VITE_MQTT_BROKER_PORT: string
  readonly VITE_MQTT_BROKER_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
