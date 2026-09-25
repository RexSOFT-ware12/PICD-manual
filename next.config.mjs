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
    // The in-browser background-removal model runtime should never pull in Node built-ins.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    // onnxruntime-web (pulled in by @imgly/background-removal, used lazily inside a
    // browser-only click handler for Photo Workspace's "Select Subject (AI)" tool) ships
    // import.meta / top-level import-export syntax that webpack's module-type detection
    // cannot parse in this project (regardless of client/server target), which aborts the
    // whole production build. Stubbing it out here keeps the rest of the merged app
    // building and shipping; it turns "Select Subject (AI)" into a clean no-op instead of
    // a build-breaker. See the reply for the follow-up needed to re-enable it (loading the
    // onnxruntime-web browser bundle via a <script> tag / CDN instead of an npm import).
    config.resolve.alias["@imgly/background-removal"] = false;
    config.resolve.alias["onnxruntime-web"] = false;
    config.resolve.alias["onnxruntime-common"] = false;
    return config;
  },
};

export default nextConfig;
