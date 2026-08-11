import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystemBlobAdapter } from "../filesystem-blob-adapter";

describe("FileSystemBlobAdapter", () => {
	let baseDir: string;

	beforeEach(() => {
		baseDir = mkdtempSync(join(tmpdir(), "opencut-fs-blob-adapter-test-"));
	});

	afterEach(() => {
		rmSync(baseDir, { recursive: true, force: true });
	});

	test("get returns null for a key that was never set", async () => {
		const adapter = new FileSystemBlobAdapter("media-files-p1", baseDir);
		expect(await adapter.get("missing")).toBeNull();
	});

	test("set then get round-trips the exact bytes and the key as the file's name", async () => {
		const adapter = new FileSystemBlobAdapter("media-files-p1", baseDir);
		const original = new File(["hello world"], "clip.mp4", {
			type: "video/mp4",
		});

		await adapter.set({ key: "asset-1", value: original });
		const result = await adapter.get("asset-1");

		expect(result).not.toBeNull();
		expect(result?.name).toBe("asset-1");
		expect(await result?.text()).toBe("hello world");
	});

	test("set overwrites an existing key's bytes", async () => {
		const adapter = new FileSystemBlobAdapter("media-files-p1", baseDir);
		await adapter.set({
			key: "asset-1",
			value: new File(["v1"], "clip.mp4"),
		});
		await adapter.set({
			key: "asset-1",
			value: new File(["v2-longer"], "clip.mp4"),
		});

		const result = await adapter.get("asset-1");
		expect(await result?.text()).toBe("v2-longer");
	});

	test("list returns all keys that have been set", async () => {
		const adapter = new FileSystemBlobAdapter("media-files-p1", baseDir);
		await adapter.set({ key: "a", value: new File(["1"], "a.mp4") });
		await adapter.set({ key: "b", value: new File(["2"], "b.mp4") });

		expect((await adapter.list()).sort()).toEqual(["a", "b"]);
	});

	test("remove deletes a key; removing a missing key is a no-op", async () => {
		const adapter = new FileSystemBlobAdapter("media-files-p1", baseDir);
		await adapter.set({ key: "a", value: new File(["1"], "a.mp4") });

		await adapter.remove("a");
		expect(await adapter.get("a")).toBeNull();

		await adapter.remove("a");
	});

	test("clear removes every key", async () => {
		const adapter = new FileSystemBlobAdapter("media-files-p1", baseDir);
		await adapter.set({ key: "a", value: new File(["1"], "a.mp4") });
		await adapter.set({ key: "b", value: new File(["2"], "b.mp4") });

		await adapter.clear();
		expect(await adapter.list()).toEqual([]);
	});

	test("different dirName instances (per-project media dirs) are isolated", async () => {
		const project1 = new FileSystemBlobAdapter("media-files-p1", baseDir);
		const project2 = new FileSystemBlobAdapter("media-files-p2", baseDir);

		await project1.set({ key: "a", value: new File(["p1-bytes"], "a.mp4") });
		await project2.set({ key: "a", value: new File(["p2-bytes"], "a.mp4") });

		expect(await (await project1.get("a"))?.text()).toBe("p1-bytes");
		expect(await (await project2.get("a"))?.text()).toBe("p2-bytes");
	});
});
