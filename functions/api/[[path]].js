// Cloudflare Pages Function — proxies /api/* to the backend container.
// Set BACKEND_URL in the Pages project (e.g. https://okami-samm.onrender.com).
// Keeps API calls same-origin for the frontend (no CORS), and the container's
// URL stays out of the client.
export async function onRequest(context) {
  const { request, env } = context;
  const base = (env.BACKEND_URL || '').replace(/\/+$/, '');
  if (!base) return new Response('BACKEND_URL not configured', { status: 503 });

  const url = new URL(request.url);
  const target = base + url.pathname + url.search; // pathname includes /api/...

  const headers = new Headers(request.headers);
  headers.delete('host');

  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  const resp = await fetch(target, init);
  // Stream the response (PDFs included) straight back to the client.
  const out = new Headers(resp.headers);
  out.delete('transfer-encoding');
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: out });
}
