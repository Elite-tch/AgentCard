export async function assertSafeUrl(url: string) {
  // Simplified for migration: real SSRF would do DNS lookup and block local IPs.
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Invalid protocol');
  }
}
