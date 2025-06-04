import { rmSync } from 'node:fs'
import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { defineConfig } from 'vite'
import { analyzer } from 'vite-bundle-analyzer'
import { checker } from 'vite-plugin-checker'
import tsconfigPaths from 'vite-tsconfig-paths'

import { siteConfig } from '../../config/site.config'
import PKG from '../../package.json'
import { ogImagePlugin } from '../../plugins/og-image-plugin'
import { createDependencyChunksPlugin } from '../../plugins/vite/deps'

if (process.env.CI) {
  rmSync(path.join(process.cwd(), 'src/pages/(debug)'), {
    recursive: true,
    force: true,
  })
}

const ReactCompilerConfig = {
  /* ... */
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', ReactCompilerConfig]],
      },
    }),

    tsconfigPaths(),
    checker({
      typescript: true,
      enableBuild: true,
    }),
    codeInspectorPlugin({
      bundler: 'vite',
      hotKeys: ['altKey'],
    }),
    createDependencyChunksPlugin([['heic-to'], ['react', 'react-dom']]),
    tailwindcss(),
    ogImagePlugin({
      title: siteConfig.title,
      description: siteConfig.description,
      siteName: siteConfig.name,
      siteUrl: siteConfig.url,
    }),
    process.env.analyzer && analyzer(),
  ],
  define: {
    APP_DEV_CWD: JSON.stringify(process.cwd()),
    APP_NAME: JSON.stringify(PKG.name),
    BUILT_DATE: JSON.stringify(new Date().toLocaleDateString()),
  },
})
