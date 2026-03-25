const path = require('path')
const root = path.resolve(__dirname)

module.exports = {
  apps: [
    {
      name: 'visible-bridge',
      script: 'bridge/server.mjs',
      cwd: root,
      interpreter: 'node',
      watch: false,
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: 'visible-vite',
      script: 'node_modules/vite/bin/vite.js',
      cwd: root,
      watch: false,
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
}
