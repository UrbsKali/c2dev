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
    readonly PUBLIC_SUPABASE_URL?: string;
    readonly PUBLIC_SUPABASE_ANON_KEY?: string;
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_ANON_KEY?: string;
    readonly VITE_RTC_GATEWAY?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export {};
