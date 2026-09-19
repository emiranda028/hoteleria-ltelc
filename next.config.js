/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  swcMinify: true,
  // Esta línea es clave para evitar errores de caracteres extraños en el compilador
  compiler: {
    removeConsole: false,
  },
}

module.exports = nextConfig
