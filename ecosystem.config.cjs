module.exports = {
  apps: [
    {
      name: 'visible-bridge',
      script: 'bridge/server.mjs',
      cwd: 'E:/VisibleOpenclaw',
      interpreter: 'node',
      watch: false,
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: 'visible-vite',
      script: 'node_modules/vite/bin/vite.js',
      cwd: 'E:/VisibleOpenclaw',
      watch: false,
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
}
