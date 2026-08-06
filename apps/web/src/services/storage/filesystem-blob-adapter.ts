import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { StorageAdapter } from "./types";
import { getHeadlessDataDir } from "./headless-paths";

function isNotFoundError(error: unknown): boolean {
	return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

/**
 * Node-backed counterpart to OPFSAdapter, for the headless runner (see
 * HEADLESS_DESIGN.md). One raw file per key in a directory, same
 * per-project-directory convention OPFSAdapter uses.
 */
export class FileSystemBlobAdapter implements StorageAdapter<File> {
	constructor(
		private dirName: string,
		private baseDir: string = getHeadlessDataDir(),
	) {}

	private dirPath(): string {
		return path.join(this.baseDir, this.dirName);
	}

	private keyPath(key: string): string {
		return path.join(this.dirPath(), encodeURIComponent(key));
	}

	private async ensureDir(): Promise<void> {
		await fs.mkdir(this.dirPath(), { recursive: true });
	}

	async get(key: string): Promise<File | null> {
		try {
			const buffer = await fs.readFile(this.keyPath(key));
			return new File([buffer], key);
		} catch (error) {
			if (isNotFoundError(error)) return null;
			throw error;
		}
	}

	async set({ key, value }: { key: string; value: File }): Promise<void> {
		await this.ensureDir();
		const buffer = Buffer.from(await value.arrayBuffer());
		await fs.writeFile(this.keyPath(key), buffer);
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
		return files.map((file) => decodeURIComponent(file));
	}

	async clear(): Promise<void> {
		const keys = await this.list();
		await Promise.all(keys.map((key) => this.remove(key)));
	}
}
