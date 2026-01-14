import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appsDir = join(__dirname, '..', 'apps');

const app = express();
const PORT = process.env.PORT || 3004;

app.use(express.json());

// List available apps at root
app.get('/', (req, res) => {
  const apps = fs.readdirSync(appsDir).filter(f => {
    const appPath = join(appsDir, f);
    return fs.statSync(appPath).isDirectory() && fs.existsSync(join(appPath, 'dist'));
  });

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Tim's Learning Apps</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        h1 { color: #333; }
        ul { list-style: none; padding: 0; }
        li { margin: 10px 0; }
        a { color: #0066cc; text-decoration: none; font-size: 1.2em; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <h1>🎓 Tim's Learning Apps</h1>
      <ul>
        ${apps.map(app => `<li><a href="/${app}/">${app}</a></li>`).join('\n        ')}
      </ul>
    </body>
    </html>
  `);
});

// Serve each app's static files and handle their API routes
fs.readdirSync(appsDir).forEach(appName => {
  const appPath = join(appsDir, appName);
  if (!fs.statSync(appPath).isDirectory()) return;

  const distPath = join(appPath, 'dist');
  const dataPath = join(appPath, 'data');

  // Ensure data directory exists
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }

  // API routes for data persistence
  app.get(`/${appName}/api/data/:file`, (req, res) => {
    const filePath = join(dataPath, `${req.params.file}.json`);
    if (fs.existsSync(filePath)) {
      res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
    } else {
      res.json({});
    }
  });

  app.post(`/${appName}/api/data/:file`, (req, res) => {
    const filePath = join(dataPath, `${req.params.file}.json`);
    fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  });

  // Serve static files
  if (fs.existsSync(distPath)) {
    app.use(`/${appName}`, express.static(distPath));

    // SPA fallback
    app.get(`/${appName}/*`, (req, res) => {
      res.sendFile(join(distPath, 'index.html'));
    });
  }
});

app.listen(PORT, () => {
  console.log(`🎓 Tim Learning Server running on port ${PORT}`);
  console.log(`📚 Apps directory: ${appsDir}`);
});
