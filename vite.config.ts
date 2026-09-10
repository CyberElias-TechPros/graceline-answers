// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    server: {
      // Preview environments are served from a generated *.e2b.app hostname.
      // Without this the dev server answers 403 to the preview proxy.
      allowedHosts: true,
    },
  },
  // The frontend deploys to Vercel; the API is a separate Cloudflare Worker.
  // Pinning the Nitro preset stops the build emitting a Cloudflare module
  // nobody deploys, and makes `vercel build` produce the right output shape.
  nitro: { preset: "vercel" },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts, which
    // wraps SSR error handling and proxies /api to the Worker.
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
