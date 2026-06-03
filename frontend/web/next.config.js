/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: `${__dirname}/../..`,
  transpilePackages: ["@oss-risk-radar/schemas"],
  async redirects() {
    return [
      {
        source: "/repos",
        destination: "/repositories",
        permanent: false,
      },
      {
        source: "/repos/:path*",
        destination: "/repositories",
        permanent: false,
      },
      {
        source: "/repo",
        destination: "/repositories",
        permanent: false,
      },
      {
        source: "/repo/:path*",
        destination: "/repositories",
        permanent: false,
      },
      {
        source: "/analysis",
        destination: "/repositories",
        permanent: false,
      },
      {
        source: "/analysis/:path*",
        destination: "/analyses/:path*",
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
