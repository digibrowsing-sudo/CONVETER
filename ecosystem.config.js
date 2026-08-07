// PM2 process list.
//
// The two workers are separate processes on purpose (spec 8.3): a finance job
// is the one people would pay for and it must never wait behind a 90-second
// PowerPoint render. Each runs at concurrency 1 because this box has 2 vCPU
// shared with EMS, ARIA, the investment bot and Coolify — FileForge is not the
// only tenant, and it is not the one with a paying client attached.
//
// max_memory_restart is the backstop, not the primary control: engines are
// already capped individually via prlimit (spec 12.4).

module.exports = {
  apps: [
    {
      name: 'fileforge-api',
      script: 'backend/src/server.js',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '400M',
    },
    {
      name: 'fileforge-worker-doc',
      script: 'backend/src/queue/worker-entry.js',
      args: 'doc',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '1500M',
      // Spec 11.4: finish the job in hand before exiting, up to 180s.
      kill_timeout: 185000,
    },
    {
      name: 'fileforge-worker-finance',
      script: 'backend/src/queue/worker-entry.js',
      args: 'finance',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '1000M',
      kill_timeout: 125000,
    },
  ],
};
