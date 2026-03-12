/** @type {import('next').NextConfig} */
const nextConfig = {
  // Frappe Gantt is a browser-only package — prevent SSR bundling issues
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'frappe-gantt'];
    }
    return config;
  },
};

export default nextConfig;
