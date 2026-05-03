/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly VITE_COHERE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
