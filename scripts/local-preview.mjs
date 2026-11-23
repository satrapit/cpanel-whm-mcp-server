/**
 * Local-only visual diagnostic harness. Uses Node built-ins, never imports the production
 * MCP server, never verifies credentials, and NEVER enables cPanel/WHM operations.
 * The /preview/rpc endpoint is intentionally not /mcp: it tests HTTP/JSON-RPC plumbing,
 * not conformance or integration with the official MCP TypeScript SDK.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageInfo = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const port = Number(process.env.PREVIEW_PORT ?? 3100);
const maxBodyBytes = 8192;

if (process.env.NODE_ENV === 'production') throw new Error('LOCAL_PREVIEW_DISABLED_IN_PRODUCTION');
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('INVALID_PREVIEW_PORT');

const allowedHostHeaders = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
const headers = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function reply(res, status, data, contentType = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { ...headers, 'Content-Type': contentType, ...extra });
  res.end(contentType.startsWith('application/json') ? JSON.stringify(data) : data);
}
function jsonRpc(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }

function handleDiagnosticRpc(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      request.jsonrpc !== '2.0' || !Object.hasOwn(request, 'id') ||
      !(['string', 'number'].includes(typeof request.id)) ||
      typeof request.method !== 'string') return rpcError(null, -32600, 'Invalid Request');
  switch (request.method) {
    case 'initialize':
      return jsonRpc(request.id, {
        protocolVersion: '2026-07-28',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'local-preview-diagnostic-only', version: packageInfo.version },
        instructions: 'Synthetic, read-only test endpoint; NOT the official MCP SDK and not a hosting connection.',
      });
    case 'tools/list':
      return jsonRpc(request.id, { tools: [{
        name: 'preview_status',
        description: 'Return test-harness readiness only. No hosting API access.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
      }] });
    case 'tools/call':
      if (request.params?.name !== 'preview_status' ||
          !request.params.arguments || typeof request.params.arguments !== 'object' ||
          Array.isArray(request.params.arguments) || Object.keys(request.params.arguments).length !== 0) {
        return rpcError(request.id, -32602, 'Invalid preview tool or arguments');
      }
      return jsonRpc(request.id, {
        content: [{ type: 'text', text: JSON.stringify({ preview: 'ready', upstreamConnections: 'disabled', persistentCredentials: 'disabled' }) }],
        isError: false,
      });
    default: return rpcError(request.id, -32601, 'Method not found');
  }
}

function createPreviewServer() {
  return createServer(async (req, res) => {
    if (!allowedHostHeaders.has(req.headers.host) ||
        (req.headers.origin !== undefined && !allowedOrigins.has(req.headers.origin))) {
      reply(res, 403, { error: 'forbidden_host_or_origin' });
      return;
    }
    if ((req.headersDistinct.authorization?.length ?? 0) > 0) {
      // No tokens should ever be transmitted to this standalone test surface.
      reply(res, 400, { error: 'credentials_not_accepted_in_preview' });
      return;
    }
    let url;
    try { url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`); }
    catch { reply(res, 400, { error: 'invalid_url' }); return; }
    if (url.origin !== `http://127.0.0.1:${port}` || url.search || url.hash) {
      reply(res, 404, { error: 'not_found' }); return;
    }
    const method = req.method ?? '';
    if (url.pathname === '/mcp') {
      reply(res, 401, { error: 'invalid_token', explanation: 'The real MCP endpoint is not enabled in the local preview.' }, 'application/json; charset=utf-8', {
        'WWW-Authenticate': 'Bearer error="invalid_token"',
      });
      return;
    }
    if (method === 'GET') {
      if (url.pathname === '/health') {
        reply(res, 200, { status: 'ok', mode: 'local-diagnostic', upstreamConnections: 'disabled', oauth: 'not_enabled' });
        return;
      }
      if (url.pathname === '/version') {
        reply(res, 200, { version: packageInfo.version, node: process.versions.node, mode: 'local-diagnostic' });
        return;
      }
      const assets = {
        '/': ['preview/index.html', 'text/html; charset=utf-8'],
        '/preview.css': ['preview/preview.css', 'text/css; charset=utf-8'],
        '/preview.js': ['preview/preview.js', 'text/javascript; charset=utf-8'],
      };
      const file = assets[url.pathname];
      if (file) { reply(res, 200, readFileSync(join(root, file[0]), 'utf8'), file[1]); return; }
    }
    if (method === 'POST' && url.pathname === '/preview/rpc') {
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '')) {
        reply(res, 415, { error: 'json_required' }); return;
      }
      let bytes = 0;
      const chunks = [];
      try {
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > maxBodyBytes) {
            reply(res, 413, { error: 'payload_too_large' }); return;
          }
          chunks.push(chunk);
        }
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        reply(res, 200, handleDiagnosticRpc(parsed));
      } catch { reply(res, 400, { error: 'invalid_json' }); }
      return;
    }
    reply(res, 404, { error: 'not_found' });
  });
}

const server = createPreviewServer();
server.requestTimeout = 10_000;
server.headersTimeout = 6_000;
server.keepAliveTimeout = 3_000;
server.maxRequestsPerSocket = 30;
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`LOCAL_DIAGNOSTIC_READY http://127.0.0.1:${port}/\n`);
  process.stdout.write('No OAuth, cPanel/WHM credentials, or production MCP server is loaded.\n');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
