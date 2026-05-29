const DEFAULT_API_BASE_URL = "http://localhost:8080/api/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

type ProxyContext = {
  params: Promise<{
    path?: string[];
  }>;
};

function normalizeExternalApiBaseUrl(value: string | undefined) {
  if (!value || value.startsWith("/")) {
    return null;
  }
  return value.replace(/\/+$/, "");
}

function upstreamApiBaseUrl() {
  return (
    normalizeExternalApiBaseUrl(process.env.WEB_API_BASE_URL) ??
    normalizeExternalApiBaseUrl(process.env.API_BASE_URL) ??
    normalizeExternalApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL) ??
    DEFAULT_API_BASE_URL
  );
}

function forwardedHeaders(request: Request) {
  const headers = new Headers(request.headers);
  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }
  headers.delete("host");
  return headers;
}

function responseHeaders(upstreamHeaders: Headers) {
  const headers = new Headers();
  upstreamHeaders.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  return headers;
}

async function proxy(request: Request, context: ProxyContext) {
  const { path = [] } = await context.params;
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`${upstreamApiBaseUrl()}/${path.map(encodeURIComponent).join("/")}`);
  targetUrl.search = sourceUrl.search;
  const requestBody = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();

  const upstreamResponse = await fetch(targetUrl, {
    method: request.method,
    headers: forwardedHeaders(request),
    body: requestBody,
    cache: "no-store",
  });

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders(upstreamResponse.headers),
  });
}

export function GET(request: Request, context: ProxyContext) {
  return proxy(request, context);
}

export function POST(request: Request, context: ProxyContext) {
  return proxy(request, context);
}

export function PUT(request: Request, context: ProxyContext) {
  return proxy(request, context);
}

export function PATCH(request: Request, context: ProxyContext) {
  return proxy(request, context);
}

export function DELETE(request: Request, context: ProxyContext) {
  return proxy(request, context);
}

export function OPTIONS() {
  return new Response(null, { status: 204 });
}
