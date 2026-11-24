'use strict';

/**
 * Abuse limits for the public socket server.
 *
 * Every event is open to anyone who can reach the server, and CORS only stops
 * browsers, not scripts. Before these limits a single script could:
 *  - call `room:create` in a loop and keep thousands of rooms alive for the
 *    2-hour stale window, each one written to the store;
 *  - call `profile:save` with fresh random UUIDs and grow the profile store
 *    without bound (the file backend rewrites the whole file on each flush);
 *  - hammer `leaderboard:get`, which reads and sorts up to 2000 profiles.
 *
 * Three layers, each cheap:
 *  1. Token buckets per socket (always on) for the expensive events, plus a
 *     flood guard on every event.
 *  2. Token buckets and a connection cap per client IP. Only when the real IP
 *     is known — see clientIp() — otherwise every player behind the hosting
 *     proxy would share one bucket and lock each other out.
 *  3. Global caps on rooms and profiles, so the worst a flood can do is make
 *     new rooms or profiles wait, never exhaust memory or disk.
 *
 * Volumetric DDoS is out of scope here: no application code can absorb that.
 * It belongs in front of the server (a proxy such as Cloudflare).
 */

/**
 * A token bucket per key. `capacity` is the allowed burst; tokens come back at
 * `refillPerSec`. Idle full buckets are swept so the map cannot grow forever.
 * @param {{ capacity: number, refillPerSec: number }} opts
 */
function createLimiter({ capacity, refillPerSec }) {
  const buckets = new Map(); // key -> { tokens, last }

  function refill(bucket, now) {
    const elapsed = (now - bucket.last) / 1000;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerSec);
    bucket.last = now;
  }

  return {
    /** Spend one token. Returns false when the key is over its limit. */
    take(key, now = Date.now()) {
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { tokens: capacity, last: now };
        buckets.set(key, bucket);
      }
      refill(bucket, now);
      if (bucket.tokens < 1) return false;
      bucket.tokens -= 1;
      return true;
    },
    reset(key) {
      buckets.delete(key);
    },
    /** Drop buckets that have refilled completely; they carry no state. */
    sweep(now = Date.now()) {
      for (const [key, bucket] of buckets) {
        refill(bucket, now);
        if (bucket.tokens >= capacity) buckets.delete(key);
      }
    },
    size() {
      return buckets.size;
    },
  };
}

/**
 * The client's IP, or null when it cannot be trusted.
 *
 * Behind a hosting proxy (Railway) every socket's own address is the proxy's,
 * so the real client is the LAST entry of X-Forwarded-For — the one the proxy
 * appended. Earlier entries are whatever the client chose to send and must not
 * be used, or an attacker could rotate fake IPs to dodge the limits.
 *
 * `trustProxy` must only be enabled when a proxy really sits in front;
 * without one the header is fully client-controlled. With it disabled the raw
 * socket address is used, which is right for a direct deployment.
 *
 * @param {import('socket.io').Socket} socket
 * @param {boolean} trustProxy
 */
function clientIp(socket, trustProxy) {
  if (trustProxy) {
    const header = socket.handshake?.headers?.['x-forwarded-for'];
    if (typeof header === 'string' && header.trim()) {
      const parts = header.split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) return parts[parts.length - 1];
    }
  }
  return socket.handshake?.address || null;
}

/** Positive integer from the environment, or the fallback. */
function envInt(name, fallback) {
  const n = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Limits, all overridable from the environment for tests and tuning. */
const LIMITS = {
  /** Most rooms held in memory at once; room:create is refused above it. */
  maxRooms: envInt('MAX_ROOMS', 2000),
  /** Most guest profiles stored; new ones are refused above it. */
  maxProfiles: envInt('MAX_PROFILES', 50000),
  /** Most simultaneous connections in total. */
  maxConnections: envInt('MAX_CONNECTIONS', 5000),
  /** Most simultaneous connections from one IP (IP limits only). */
  maxConnectionsPerIp: envInt('MAX_CONNECTIONS_PER_IP', 20),
  /** How long a leaderboard response may be reused, in ms. */
  leaderboardCacheMs: envInt('LEADERBOARD_CACHE_MS', 15000),
};

/**
 * Whether per-IP limits are active. They need a trustworthy IP: either a
 * proxy we trust (TRUST_PROXY=1) or an explicit opt-in for a direct
 * deployment (IP_LIMITS=1).
 */
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const IP_LIMITS = TRUST_PROXY || process.env.IP_LIMITS === '1';

module.exports = {
  createLimiter,
  clientIp,
  LIMITS,
  TRUST_PROXY,
  IP_LIMITS,
};
