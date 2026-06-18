const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');

const questions = require('./routes/questions');
const messages = require('./routes/messages');
const archive = require('./routes/archive');
const admin = require('./routes/admin');
const prayer = require('./routes/prayer');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

// API
app.use('/api/questions', questions);
app.use('/api/messages', messages);
app.use('/api/archive', archive);
app.use('/api/admin', admin);
app.use('/api/prayer', prayer);
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// Static SPA
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, { maxAge: '1h', index: false }));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.status(200).send(
      '<h1>SoulConnect</h1><p>Frontend not built yet. Run <code>npm run build</code> in the app folder.</p>'
    );
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[soulconnect] listening on :${PORT}`);
});

module.exports = app;
