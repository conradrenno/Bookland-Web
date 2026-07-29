import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // `BookViewModel.coverImageUrl` aponta para a capa do livro. O next/image
    // só otimiza hosts declarados aqui — ajuste conforme onde as capas ficam
    // hospedadas. Por ora: backend local em dev.
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "8080", pathname: "/**" },
      // TODO: adicionar o host real das capas em produção (CDN/bucket), ex.:
      // { protocol: "https", hostname: "images.bookland.example", pathname: "/**" },
    ],
  },
};

export default nextConfig;
