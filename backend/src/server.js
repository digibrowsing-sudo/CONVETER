'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const app = express();

app.use(helmet());
app.use(cors({ origin: false })); // same-origin only
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const port = Number(process.env.PORT) || 8095;

if (require.main === module) {
  app.listen(port, () => {
    process.stdout.write(
      JSON.stringify({ level: 'info', msg: `FileForge API listening on ${port}` }) + '\n',
    );
  });
}

module.exports = app;
