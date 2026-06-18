// Passenger entry point for cPanel / DirectAdmin "Setup Node.js App".
// The Node.js app panel will start this file. We just delegate to the
// Express server in ./server/index.js.
require('dotenv').config();
require('./server/index.js');
