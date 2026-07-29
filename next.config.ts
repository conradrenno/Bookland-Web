import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // `BookViewModel.coverImageUrl` aponta para a capa do livro, e o next/image
    // só otimiza hosts declarados aqui — um host ausente derruba a página
    // renderizada. As capas vêm de duas origens (ver docs/specs/03-catalog.md):
    remotePatterns: [
      // 1. Upload via API: caminho relativo `/media/covers/{uuid}.jpg`, servido
      //    pelo próprio Spring (`MEDIA_BASE_URL` em src/lib/config.ts).
      { protocol: "http", hostname: "localhost", port: "8080", pathname: "/**" },
      // 2. Catálogo semeado: URL absoluta da OpenLibrary.
      { protocol: "https", hostname: "covers.openlibrary.org", pathname: "/**" },
      // TODO: adicionar o host real das capas em produção (CDN/bucket), ex.:
      // { protocol: "https", hostname: "images.bookland.example", pathname: "/**" },
    ],
  },
};

export default nextConfig;
