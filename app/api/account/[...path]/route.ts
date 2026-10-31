import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: { path: string[] } };

async function proxy(request: NextRequest, context: RouteContext) {
  const backend = (process.env.ACCOUNT_API_URL || process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
  if (!backend) return NextResponse.json({ message: 'The EchoVest account service URL is not configured.' }, { status: 503 });

  const endpoint = context.params.path.map(encodeURIComponent).join('/');
  const headers = new Headers();
  for (const name of ['accept', 'content-type', 'cookie']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const upstream = await fetch(`${backend}/${endpoint}${request.nextUrl.search}`, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });

    const responseHeaders = new Headers();
    for (const name of ['content-type', 'cache-control', 'set-cookie']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return NextResponse.json({ message: 'Cannot reach the EchoVest account service. Please try again.' }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
