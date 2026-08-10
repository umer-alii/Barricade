/**
 * Local development server — serves static files + API routes.
 * Run: npm run dev:local
 * For production-like testing with Vercel: npm run dev (requires vercel login)
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function createMockRes() {
  let statusCode = 200;
  const headers = {};
  let body = '';
  const res = {
    status(code) { statusCode = code; return res; },
    setHeader(k, v) { headers[k] = v; },
    json(data) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(data);
      return res;
    },
    end(data) {
      if (data) body = data;
      return res;
    },
    _getResult() {
      return { statusCode, headers, body };
    }
  };
  return res;
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  let body = '';
  if (req.method === 'POST') {
    body = await new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => resolve(data));
    });
  }

  let parsedBody = {};
  if (body) {
    try {
      parsedBody = JSON.parse(body);
    } catch (_) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return true;
    }
  }

  const mockReq = {
    method: req.method,
    query: Object.fromEntries(url.searchParams),
    body: parsedBody
  };

  const mockRes = createMockRes();

  try {
    if (pathname === '/api/rooms/create') {
      const mod = await import('../api/rooms/create.js');
      await mod.default(mockReq, mockRes);
    } else if (pathname === '/api/rooms/list') {
      const mod = await import('../api/rooms/list.js');
      await mod.default(mockReq, mockRes);
    } else if (pathname === '/api/rooms/join') {
      const mod = await import('../api/rooms/join.js');
      await mod.default(mockReq, mockRes);
    } else if (pathname === '/api/rooms/poll') {
      const mod = await import('../api/rooms/poll.js');
      await mod.default(mockReq, mockRes);
    } else if (pathname === '/api/rooms/action') {
      const mod = await import('../api/rooms/action.js');
      await mod.default(mockReq, mockRes);
    } else if (pathname === '/api/rooms/info') {
      const mod = await import('../api/rooms/info.js');
      await mod.default(mockReq, mockRes);
    } else if (pathname === '/api/rooms/delete') {
      const mod = await import('../api/rooms/delete.js');
      await mod.default(mockReq, mockRes);
    } else {
      return false;
    }

    const result = mockRes._getResult();
    res.writeHead(result.statusCode, result.headers);
    res.end(result.body);
    return true;
  } catch (err) {
    console.error('API error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
    return true;
  }
}

function serveStatic(req, res) {
  let filePath = path.join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) {
    const handled = await handleApi(req, res);
    if (handled) return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Barricade dev server running at http://localhost:${PORT}`);
});
