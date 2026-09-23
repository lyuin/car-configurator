import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * GitHub Pages ではリポジトリ名のサブパス配信になるため base を切り替える。
 * ローカルの dev / preview はルート配信のままにして、開発時の取り回しを良くする。
 * リポジトリ名を変更したらここも合わせて変更する。
 */
const repoName = 'car-configurator';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? `/${repoName}/` : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
