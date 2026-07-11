module.exports = {
  apps: [
    {
      name: 'fileforge-api',
      script: 'backend/src/server.js',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '300M',
    },
    {
      name: 'fileforge-worker',
      script: 'backend/src/queue/worker-entry.js',
      instances: 2,
      env: { NODE_ENV: 'production' },
      max_memory_restart: '500M',
    },
  ],
};
