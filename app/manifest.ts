import type { MetadataRoute } from "next";

// PWA Web App Manifest — Next Metadata API가 /manifest.webmanifest로 제공하고
// <link rel="manifest">도 자동으로 추가한다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "다빈이의 강사일기",
    short_name: "강사일기",
    description: "수업과 학생을 따뜻하게 기록하는 강사용 디지털 플래너",
    lang: "ko-KR",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f6f6f7",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
