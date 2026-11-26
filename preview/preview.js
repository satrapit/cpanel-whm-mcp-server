'use strict';
const $ = id => document.getElementById(id);
async function request(path, init) {
  const response = await fetch(path, { cache: 'no-store', ...init });
  let payload;
  try { payload = await response.json(); }
  catch { payload = { error: 'invalid_response' }; }
  return { status: response.status, payload };
}
async function checkHealth() {
  $('healthValue').textContent = 'Checking…';
  try {
    const [health, version] = await Promise.all([request('/health'), request('/version')]);
    const healthy = health.status === 200 && health.payload.status === 'ok';
    $('healthValue').textContent = healthy ? 'Healthy' : 'Unavailable';
    $('healthValue').className = healthy ? 'metric ready' : 'metric';
    $('healthDetail').textContent = `GET /health → HTTP ${health.status} · ${health.payload.mode ?? 'unknown'}`;
    $('versionValue').textContent = version.payload.version ?? '—';
    $('nodeValue').textContent = version.payload.node ?? '—';
  } catch (error) {
    $('healthValue').textContent = 'Connection failed';
    $('healthDetail').textContent = 'Local HTTP listener could not be reached';
  }
}
let nextId = 1;
async function rpc(method, params) {
  $('rpcStatus').textContent = '· Sending local request…';
  try {
    const result = await request('/preview/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, ...(params === undefined ? {} : { params }) }),
    });
    $('rpcStatus').textContent = `· HTTP ${result.status} · ${method}`;
    $('rpcOutput').textContent = JSON.stringify(result.payload, null, 2);
  } catch {
    $('rpcStatus').textContent = '· Network error';
    $('rpcOutput').textContent = 'Could not reach the local diagnostic server.';
  }
}
$('checkButton').addEventListener('click', checkHealth);
$('initButton').addEventListener('click', () => rpc('initialize', { protocolVersion: '2026-07-28', capabilities: {}, clientInfo: { name: 'local-preview-ui', version: '0.1.0' } }));
$('listButton').addEventListener('click', () => rpc('tools/list'));
$('callButton').addEventListener('click', () => rpc('tools/call', { name: 'preview_status', arguments: {} }));
$('denyButton').addEventListener('click', async () => {
  const { status, payload } = await request('/mcp');
  $('rpcStatus').textContent = `· GET /mcp → HTTP ${status}`;
  $('rpcOutput').textContent = JSON.stringify(payload, null, 2);
});
void checkHealth();
