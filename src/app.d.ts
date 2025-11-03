// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    interface Locals {
      userId?: string;
      role?: import('$stores/user').UserRole;
    }
  }

  interface ImportMetaEnv {
    readonly PUBLIC_APPWRITE_ENDPOINT?: string;
    readonly PUBLIC_APPWRITE_PROJECT_ID?: string;
    readonly PUBLIC_APPWRITE_PROJECT_NAME?: string;
    readonly VITE_APPWRITE_ENDPOINT?: string;
    readonly VITE_APPWRITE_PROJECT_ID?: string;
    readonly VITE_APPWRITE_PROJECT_NAME?: string;
    readonly VITE_RTC_GATEWAY?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export {};
