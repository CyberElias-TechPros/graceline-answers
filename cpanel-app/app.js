'use strict';

// Passenger entry point for cPanel / DirectAdmin "Setup Node.js App".
// The Node.js app panel starts this file; we delegate to the Express server.
require('dotenv').config();

require('./server/index.js');

process.on('unhandledRejection', (reason) => {
  console.error('[graceline-answers] unhandledRejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[graceline-answers] uncaughtException:', err);
});
