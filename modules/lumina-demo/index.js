// Lumina Module API v1 — playback diagnostic provider.
// Uses Flutter's public MP4 sample to verify the native video playback pipeline.
const sample = {
  title: "Lumina Playback Test",
  href: "lumina-playback-test",
  image: "https://flutter.github.io/assets-for-api-docs/assets/videos/bee.png",
  year: "Demo",
  description: "Public MP4 sample used to test Lumina playback."
};

globalThis.LuminaModule = {
  apiVersion: 1,
  contentType: "video",

  search(query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q || sample.title.toLowerCase().includes(q) || "lumina playback test".includes(q)) {
      return [sample];
    }
    return [];
  },

  details(href) {
    if (href !== sample.href) return null;
    return { ...sample, description: "Lumina diagnostic item. Select the episode to test playback." };
  },

  episodes(href) {
    if (href !== sample.href) return [];
    return [{
      title: "Sample MP4 video",
      href: "lumina-playback-test-episode-1",
      season: "1"
    }];
  },

  stream(episodeHref) {
    if (episodeHref !== "lumina-playback-test-episode-1") return null;
    return {
      url: "https://flutter.github.io/assets-for-api-docs/assets/videos/bee.mp4",
      headers: {}
    };
  },

  home() {
    return [sample];
  }
};
