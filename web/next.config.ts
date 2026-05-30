import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
    // Only proxy when pointing at a real remote server (not localhost dev)
    if (!socketUrl || socketUrl.includes('localhost')) return [];
    const base = socketUrl.startsWith('http') ? socketUrl : `https://${socketUrl}`;
    return [
      {
        source: '/socket.io/:path*',
        destination: `${base}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;
