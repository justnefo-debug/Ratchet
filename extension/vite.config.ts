import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fs from 'fs';
import { build as esbuildBuild } from 'esbuild';

function bundleContentScriptsPlugin(isTest: boolean, outDir: string): Plugin {
  return {
    name: 'bundle-content-scripts',
    apply: 'build',
    closeBundle: async () => {
      // Content scripts must be self-contained IIFE classic scripts with no import/export statements
      await esbuildBuild({
        entryPoints: [resolve(__dirname, 'src/content/interceptor-main.ts')],
        bundle: true,
        format: 'iife',
        outfile: resolve(__dirname, `${outDir}/assets/interceptor-main.js`),
        platform: 'browser',
        target: 'es2020',
        define: {
          __TEST_BUILD__: isTest ? 'true' : 'false',
        },
      });
      await esbuildBuild({
        entryPoints: [resolve(__dirname, 'src/content/index.ts')],
        bundle: true,
        format: 'iife',
        outfile: resolve(__dirname, `${outDir}/assets/content.js`),
        platform: 'browser',
        target: 'es2020',
        define: {
          __TEST_BUILD__: isTest ? 'true' : 'false',
        },
      });

      // If test build, inject localhost / 127.0.0.1 into outDir/manifest.json
      if (isTest) {
        const manifestPath = resolve(__dirname, `${outDir}/manifest.json`);
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          const testMatches = ['http://localhost/*', 'http://127.0.0.1/*'];

          manifest.host_permissions = [
            ...(manifest.host_permissions || []),
            ...testMatches,
          ];

          if (Array.isArray(manifest.content_scripts)) {
            for (const cs of manifest.content_scripts) {
              cs.matches = [...(cs.matches || []), ...testMatches];
            }
          }

          fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const isTest = mode === 'test' || process.env.TEST_BUILD === 'true';
  const outDir = isTest ? 'dist-test' : 'dist';

  return {
    plugins: [react(), bundleContentScriptsPlugin(isTest, outDir)],
    base: './',
    define: {
      __TEST_BUILD__: JSON.stringify(isTest),
    },
    build: {
      outDir,
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'src/popup/popup.html'),
          options: resolve(__dirname, 'src/options/options.html'),
          background: resolve(__dirname, 'src/background/service-worker.ts'),
          redosWorker: resolve(__dirname, 'src/detectors/redos-worker.ts'),
        },
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name].[ext]',
        },
      },
    },
  };
});
