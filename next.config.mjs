/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  experimental: {
    serverComponentsExternalPackages: ["@imgly/background-removal", "onnxruntime-web"],
  },
  webpack: (config) => {
    // Konva's Node build optionally requires the native "canvas" package.
    // We only use Konva in the browser (Photo Workspace), so stub it out.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    // The browser AI module is loaded with webpackIgnore from the official ESM
    // CDN at click time. Keep Node built-ins unavailable to the client bundle.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    return config;
  },
};

export default nextConfig;
