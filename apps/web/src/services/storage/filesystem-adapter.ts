import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { StorageAdapter } from "./types";
import { getHeadlessDataDir } from "./headless-paths";

function isNotFoundError(error: unknown): boolean {
	return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

/**
 * Node-backed counterpart to IndexedDBAdapter, for the headless runner
 * (see HEADLESS_DESIGN.md). One JSON file per key, mirroring
 * IndexedDBAdapter.set's `{ id: key, ...value }` merge so callers that
 * read the `id` field back off a stored record see the same shape.
 */
export class FileSystemAdapter<T extends object> implements StorageAdapter<T> {
	constructor(
		private dirName: string,
		private baseDir: string = getHeadlessDataDir(),
	) {}

	private dirPath(): string {
		return path.join(this.baseDir, this.dirName);
	}

	private keyPath(key: string): string {
		return path.join(this.dirPath(), `${encodeURIComponent(key)}.json`);
	}

	private async ensureDir(): Promise<void> {
		await fs.mkdir(this.dirPath(), { recursive: true });
	}

	async get(key: string): Promise<T | null> {
		try {
			const raw = await fs.readFile(this.keyPath(key), "utf8");
			return JSON.parse(raw) as T;
		} catch (error) {
			if (isNotFoundError(error)) return null;
			throw error;
		}
	}

	async set({ key, value }: { key: string; value: T }): Promise<void> {
		await this.ensureDir();
		const record = { id: key, ...value };
		await fs.writeFile(this.keyPath(key), JSON.stringify(record, null, 2));
	}

	async remove(key: string): Promise<void> {
		try {
			await fs.unlink(this.keyPath(key));
		} catch (error) {
			if (!isNotFoundError(error)) throw error;
		}
	}

	async list(): Promise<string[]> {
		await this.ensureDir();
		const files = await fs.readdir(this.dirPath());
		return files
			.filter((file) => file.endsWith(".json"))
			.map((file) => decodeURIComponent(file.slice(0, -".json".length)));
	}

	async getAll(): Promise<T[]> {
		const keys = await this.list();
		const values = await Promise.all(keys.map((key) => this.get(key)));
		return values.filter((value) => value !== null) as T[];
	}

	async clear(): Promise<void> {
		const keys = await this.list();
		await Promise.all(keys.map((key) => this.remove(key)));
	}
}
