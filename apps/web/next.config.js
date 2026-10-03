/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['bcryptjs'],
  },
  serverExternalPackages: ['@bull-board/api', '@bull-board/ui', '@bull-board/hono', 'bullmq'],
  outputFileTracingIncludes: {
    '/superadmin/jobs/*': ['./node_modules/@bull-board/ui/dist/**/*'],
  },
  outputFileTracingRoot: require('path').join(__dirname, '../../'),
};

module.exports = nextConfig;