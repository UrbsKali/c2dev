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
      $types: 'src/lib/types',
      $config: 'src/lib/config',
      $teleop: 'src/lib/teleop',
      $monitoring: 'src/lib/monitoring'
    }
  }
};

export default config;
