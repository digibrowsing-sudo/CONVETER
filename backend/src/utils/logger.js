'use strict';

// Tiny JSON-line logger. info/warn go to stdout, error to stderr.

function write(stream, level, msg, fields) {
  const entry = { ts: new Date().toISOString(), level, msg, ...fields };
  stream.write(JSON.stringify(entry) + '\n');
}

module.exports = {
  info: (msg, fields = {}) => write(process.stdout, 'info', msg, fields),
  warn: (msg, fields = {}) => write(process.stdout, 'warn', msg, fields),
  error: (msg, fields = {}) => write(process.stderr, 'error', msg, fields),
};
