import { defineConfig, loadEnv } from 'vite'
import adonisjs from '@adonisjs/vite/client'
import react from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

export default defineConfig(({ mode }) => {

  const env = loadEnv(mode, process.cwd(), '');

  return ({
    plugins: [
      adonisjs({
        /**
         * Entrypoints of your application. Each entrypoint will
         * result in a separate bundle.
         */
        entryPoints: ['client-src/App.tsx'],

        /**
         * Paths to watch and reload the browser on file change
         */
        reload: ['resources/views/**/*.edge'],
      }),
      react(),
      babel({
        plugins: [
          ['@babel/plugin-proposal-decorators', { 'version': '2023-11' }],
        ],
      }),
    ],
    css: {
      modules: {
        localsConvention: 'camelCase',
      }
    },
    server: {
      allowedHosts: env.NGROK_HOST ? [env.NGROK_HOST] : []
    }
  })
})
