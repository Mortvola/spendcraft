import { defineConfig } from 'vite'
import adonisjs from '@adonisjs/vite/client'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    adonisjs({
      /**
       * Entrypoints of your application. Each entrypoint will
       * result in a separate bundle.
       */
      entrypoints: ['client-src/App.tsx'],

      /**
       * Paths to watch and reload the browser on file change
       */
      reload: ['resources/views/**/*.edge'],
    }),
    react({
      babel: {
        plugins: [
          ['@babel/plugin-proposal-decorators', { 'version': '2023-11' }],
        ],
      },
    }),
  ],
  css: {
    modules: {
      localsConvention: 'camelCase',
    }
  }
})
