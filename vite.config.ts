import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
export default defineConfig({ plugins: [sveltekit()], server: { host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:4260' } } });
