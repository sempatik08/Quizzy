/** @type {import('next').NextConfig} */
const nextConfig = {
  // `standalone` emits a self-contained server bundle with only the traced
  // dependencies — that is what the Docker image ships. It is opt-in because
  // `next start` refuses to run against a standalone build, and we don't want
  // to break the normal local `npm run build && npm start` flow.
  ...(process.env.NEXT_OUTPUT_STANDALONE === '1' ? { output: 'standalone' } : {}),
};

module.exports = nextConfig;
