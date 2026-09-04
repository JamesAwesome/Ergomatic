/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NFC_GATE_MINUS_ONE_PREFILL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
