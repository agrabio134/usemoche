import type { APIRoute } from 'astro';

/**
 * Runs a Node-style (req, res) handler as an Astro API route, so the
 * FirePad server handlers can be reused unchanged on Vercel.
 */
type Handler = (req: any, res: any) => unknown;

export function toAstro(handler: Handler): APIRoute {
  return async ({ request }) => {
    const url = new URL(request.url);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
    if (!headers.host) headers.host = url.host;

    let body: unknown;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const text = await request.text();
      try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
    }
    const req = { method: request.method, url: url.pathname + url.search, headers, body };

    return new Promise<Response>((resolve) => {
      const out = new Headers();
      let status = 200;
      let done = false;
      const send = (payload: string, type: string) => {
        if (done) return;
        done = true;
        if (!out.has('content-type')) out.set('content-type', type);
        resolve(new Response(payload, { status, headers: out }));
      };
      const res = {
        setHeader(key: string, value: string | number) { out.set(key, String(value)); return res; },
        status(code: number) { status = code; return res; },
        json(value: unknown) { send(JSON.stringify(value), 'application/json'); return res; },
        send(value: string) { send(String(value), 'text/plain'); return res; },
      };
      Promise.resolve(handler(req, res))
        .then(() => { if (!done) { status = 500; send(JSON.stringify({ error: 'No response' }), 'application/json'); } })
        .catch(() => { status = 500; send(JSON.stringify({ error: 'Server error. Please retry.' }), 'application/json'); });
    });
  };
}
