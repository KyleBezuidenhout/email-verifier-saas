/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Temporarily ignore type errors to diagnose build hanging issue
    // TODO: Re-enable once build completes successfully
    ignoreBuildErrors: true,
  },
  eslint: {
    // Temporarily ignore ESLint errors to diagnose build hanging issue
    // TODO: Re-enable once build completes successfully
    ignoreDuringBuilds: true,
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



