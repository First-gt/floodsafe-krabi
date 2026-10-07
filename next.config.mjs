/** @type {import('next').NextConfig} */

// โหมด static export สำหรับ GitHub Pages (ตั้งค่าโดย workflow: STATIC_EXPORT=1, NEXT_PUBLIC_BASE_PATH=/ชื่อ-repo)
const staticExport = process.env.STATIC_EXPORT === '1';

const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  ...(staticExport
    ? {
        output: 'export',
        trailingSlash: true,
        images: { unoptimized: true },
        basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
      }
    : {}),
};

export default nextConfig;
