/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Don't fail build on type errors during build (for now, to diagnose hanging issue)
    ignoreBuildErrors: false,
  },
  eslint: {
    // Don't fail build on ESLint errors during build
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.ibb.co',
      },
    ],
  },
}

module.exports = nextConfig



