/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STREAM_TITLE?: string;
  readonly VITE_ROOM_ID?: string;
  readonly VITE_VIEWER_PASSCODE?: string;
  readonly VITE_HOST_PASSCODE?: string;
  readonly VITE_MASTER_PASSCODE?: string;
  readonly VITE_PRIMARY_HLS_URL?: string;
  readonly VITE_BACKUP_EMBED_URL?: string;
  readonly VITE_DISCORD_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
