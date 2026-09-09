'use strict';

const { createApp } = require('./app');

const app = createApp();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`[graceline-answers] listening on http://${HOST}:${PORT}`);
});

module.exports = app;
