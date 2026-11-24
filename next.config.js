/** @type {import('next').NextConfig} */
const nextConfig = {
  // `standalone` emits a self-contained server bundle with only the traced
  // dependencies — that is what the Docker image ships. It is opt-in because
  // `next start` refuses to run against a standalone build, and we don't want
  // to break the normal local `npm run build && npm start` flow.
  ...(process.env.NEXT_OUTPUT_STANDALONE === '1' ? { output: 'standalone' } : {}),
  // An English-friendly alias for the Daily Quiz (PBI 26); the Turkish path is canonical.
  async redirects() {
    return [{ source: '/daily', destination: '/gunun-quizi', permanent: true }];
  },
};

module.exports = nextConfig;
