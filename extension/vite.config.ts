import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { build as esbuildBuild } from 'esbuild';

function bundleContentScriptsPlugin(): Plugin {
  return {
    name: 'bundle-content-scripts',
    apply: 'build',
    closeBundle: async () => {
      // Content scripts must be self-contained IIFE classic scripts with no import/export statements
      await esbuildBuild({
        entryPoints: [resolve(__dirname, 'src/content/interceptor-main.ts')],
        bundle: true,
        format: 'iife',
        outfile: resolve(__dirname, 'dist/assets/interceptor-main.js'),
        platform: 'browser',
        target: 'es2020',
      });
      await esbuildBuild({
        entryPoints: [resolve(__dirname, 'src/content/index.ts')],
        bundle: true,
        format: 'iife',
        outfile: resolve(__dirname, 'dist/assets/content.js'),
        platform: 'browser',
        target: 'es2020',
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), bundleContentScriptsPlugin()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        options: resolve(__dirname, 'src/options/options.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});
