import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess({ postcss: true }),
  kit: {
    adapter: adapter(),
    alias: {
      $components: 'src/lib/components',
      $services: 'src/lib/services',
      $stores: 'src/lib/stores',
      $types: 'src/lib/types'
    }
  }
};

export default config;
