import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return []
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['api-inference.huggingface.co'],
    },
  },
};

export default nextConfig;
