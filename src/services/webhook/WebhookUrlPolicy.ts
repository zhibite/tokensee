import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { env } from '../../config/index.js';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'host.docker.internal',
  'gateway.docker.internal',
  'metadata.google.internal',
]);

function privateWebhookUrlsAllowed(): boolean {
  return env.ALLOW_PRIVATE_WEBHOOK_URLS ?? env.NODE_ENV !== 'production';
}

function normalizeHost(hostname: string): string {
  return hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
}

function normalizeIp(address: string): string {
  const lower = address.toLowerCase();
  return lower.startsWith('::ffff:') ? lower.slice(7) : lower;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const lower = normalizeIp(address);
  return (
    lower === '::' ||
    lower === '::1' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    /^fe[89ab]/.test(lower)
  );
}

function isPrivateIp(address: string): boolean {
  const normalized = normalizeIp(address);
  const family = isIP(normalized);
  if (family === 4) return isPrivateIpv4(normalized);
  if (family === 6) return isPrivateIpv6(normalized);
  return true;
}

function isBlockedHostname(hostname: string): boolean {
  return (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  );
}

export interface WebhookUrlSafetyResult {
  safe: boolean;
  reason?: string;
}

export async function getWebhookUrlSafety(urlString: string): Promise<WebhookUrlSafetyResult> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: 'url must be a valid http/https URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: 'url must use http or https' };
  }

  if (parsed.username || parsed.password) {
    return { safe: false, reason: 'url must not include embedded credentials' };
  }

  if (privateWebhookUrlsAllowed()) {
    return { safe: true };
  }

  const hostname = normalizeHost(parsed.hostname);

  if (isBlockedHostname(hostname)) {
    return { safe: false, reason: 'private or local webhook targets are disabled' };
  }

  if (isIP(hostname) && isPrivateIp(hostname)) {
    return { safe: false, reason: 'private IP webhook targets are disabled' };
  }

  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some((entry) => isPrivateIp(entry.address))) {
      return { safe: false, reason: 'webhook target resolves to a private or reserved IP' };
    }
  } catch {
    return { safe: false, reason: 'webhook hostname could not be resolved safely' };
  }

  return { safe: true };
}
