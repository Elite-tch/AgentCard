import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const STATUS_HOST = 'status.agentcard.com';
const STATIC_FILE_RE = /\.[a-zA-Z0-9]+$/;

export function proxy(request: NextRequest) {
  const host = request.headers.get('host') || '';
  if (host === STATUS_HOST || host.startsWith(`${STATUS_HOST}:`)) {
    const url = request.nextUrl.clone();
    const path = url.pathname;

    if (
      path.startsWith('/_next') ||
      path.startsWith('/api') ||
      path.startsWith('/.well-known') ||
      STATIC_FILE_RE.test(path)
    ) {
      return NextResponse.next();
    }
    url.pathname = '/status';
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    {
      source: '/((?!_next|api|\\.well-known|.*\\.[a-zA-Z0-9]+$).*)',
      has: [{ type: 'header', key: 'host', value: 'status.agentcard.com' }],
    },
  ],
};
