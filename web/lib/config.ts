// App-wide configuration pulled from environment variables.
// All URL references across the app should use these constants
// instead of hardcoding domain names.

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
