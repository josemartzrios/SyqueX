import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',   // SSG — generates static HTML, no server needed
  trailingSlash: true,
}

export default nextConfig
