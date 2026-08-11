import * as path from "node:path";

export function isBrowserStorageAvailable(): boolean {
	return typeof indexedDB !== "undefined";
}

export function getHeadlessDataDir(): string {
	return (
		process.env.OPENCUT_HEADLESS_DATA_DIR ??
		path.join(process.cwd(), ".opencut-headless-data")
	);
}
