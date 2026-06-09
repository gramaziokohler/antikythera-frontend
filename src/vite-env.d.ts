/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MQTT_BROKER_HOST: string
  readonly VITE_MQTT_BROKER_PORT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
