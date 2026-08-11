import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";
import { withContentCollections } from "@content-collections/next";

const nextConfig: NextConfig = {
	compiler: {
		removeConsole: process.env.NODE_ENV === "production",
	},
	reactStrictMode: true,
	productionBrowserSourceMaps: true,
	output: "standalone",
	turbopack: {
		resolveAlias: {
			// filesystem-adapter.ts / filesystem-blob-adapter.ts (the headless
			// runner's node:fs-backed storage adapters, see HEADLESS_DESIGN.md)
			// are statically reachable from the real "use client" editor page
			// via storage/service.ts, so Turbopack compiles them for the browser
			// bundle too -- bare `node:fs` has no browser target and fails that
			// compile outright, even though the branch that needs it is never
			// reached at runtime in an actual browser. See
			// src/services/storage/browser-node-fs-shim.ts for details.
			"node:fs": {
				browser: "./src/services/storage/browser-node-fs-shim.ts",
			},
		},
	},
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "plus.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.marblecms.com",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "api.iconify.design",
			},
			{
				protocol: "https",
				hostname: "api.simplesvg.com",
			},
			{
				protocol: "https",
				hostname: "api.unisvg.com",
			},
			{
				protocol: "https",
				hostname: "cdn.brandfetch.io",
			},
		],
	},
};

export default withContentCollections(withBotId(nextConfig));
