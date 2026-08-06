/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
  readonly VITE_INITIAL_ADMIN_USERNAME?: string;
  readonly VITE_INITIAL_ADMIN_PASSWORD?: string;
  readonly VITE_INITIAL_ADMIN_NAME?: string;
  readonly VITE_INITIAL_ADMIN_COMPANY_NAME?: string;
  readonly VITE_INITIAL_ADMIN_DEPARTMENT_NAME?: string;
  readonly VITE_INITIAL_ADMIN_SECTOR_NAME?: string;
  readonly VITE_INITIAL_ADMIN_ROLE?: string;
  readonly VITE_INITIAL_ADMIN_POSITION?: string;
  readonly VITE_PYTHON_IMPORT_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
