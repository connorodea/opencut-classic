import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystemAdapter } from "../filesystem-adapter";

interface Fixture {
	id?: string;
	name: string;
	value: number;
}

describe("FileSystemAdapter", () => {
	let baseDir: string;

	beforeEach(() => {
		baseDir = mkdtempSync(join(tmpdir(), "opencut-fs-adapter-test-"));
	});

	afterEach(() => {
		rmSync(baseDir, { recursive: true, force: true });
	});

	test("get returns null for a key that was never set", async () => {
		const adapter = new FileSystemAdapter<Fixture>("things", baseDir);
		expect(await adapter.get("missing")).toBeNull();
	});

	test("set then get round-trips the value, merged with its own key as id", async () => {
		const adapter = new FileSystemAdapter<Fixture>("things", baseDir);
		await adapter.set({ key: "a", value: { name: "alpha", value: 1 } });

		const result = await adapter.get("a");
		expect(result).toEqual({ id: "a", name: "alpha", value: 1 });
	});

	test("set overwrites an existing key", async () => {
		const adapter = new FileSystemAdapter<Fixture>("things", baseDir);
		await adapter.set({ key: "a", value: { name: "alpha", value: 1 } });
		await adapter.set({ key: "a", value: { name: "alpha-v2", value: 2 } });

		const result = await adapter.get("a");
		expect(result).toEqual({ id: "a", name: "alpha-v2", value: 2 });
	});

	test("list returns all keys that have been set", async () => {
		const adapter = new FileSystemAdapter<Fixture>("things", baseDir);
		await adapter.set({ key: "a", value: { name: "alpha", value: 1 } });
		await adapter.set({ key: "b", value: { name: "beta", value: 2 } });

		const keys = await adapter.list();
		expect(keys.sort()).toEqual(["a", "b"]);
	});

	test("list on a store nothing has ever been written to returns empty", async () => {
		const adapter = new FileSystemAdapter<Fixture>("empty-store", baseDir);
		expect(await adapter.list()).toEqual([]);
	});

	test("getAll returns every stored value", async () => {
		const adapter = new FileSystemAdapter<Fixture>("things", baseDir);
		await adapter.set({ key: "a", value: { name: "alpha", value: 1 } });
		await adapter.set({ key: "b", value: { name: "beta", value: 2 } });

		const all = await adapter.getAll();
		expect(all.sort((x, y) => x.name.localeCompare(y.name))).toEqual([
			{ id: "a", name: "alpha", value: 1 },
			{ id: "b", name: "beta", value: 2 },
		]);
	});

	test("remove deletes a key; removing a missing key is a no-op", async () => {
		const adapter = new FileSystemAdapter<Fixture>("things", baseDir);
		await adapter.set({ key: "a", value: { name: "alpha", value: 1 } });

		await adapter.remove("a");
		expect(await adapter.get("a")).toBeNull();
		expect(await adapter.list()).toEqual([]);

		// Removing again (already gone) must not throw.
		await adapter.remove("a");
	});

	test("clear removes every key", async () => {
		const adapter = new FileSystemAdapter<Fixture>("things", baseDir);
		await adapter.set({ key: "a", value: { name: "alpha", value: 1 } });
		await adapter.set({ key: "b", value: { name: "beta", value: 2 } });

		await adapter.clear();
		expect(await adapter.list()).toEqual([]);
	});

	test("keys containing characters that aren't filesystem-safe round-trip correctly", async () => {
		const adapter = new FileSystemAdapter<Fixture>("things", baseDir);
		const trickyKey = "some/id:with weird?chars";
		await adapter.set({ key: trickyKey, value: { name: "tricky", value: 1 } });

		expect(await adapter.get(trickyKey)).toEqual({
			id: trickyKey,
			name: "tricky",
			value: 1,
		});
		expect(await adapter.list()).toEqual([trickyKey]);
	});

	test("different dirName instances are isolated stores", async () => {
		const projects = new FileSystemAdapter<Fixture>("projects", baseDir);
		const sounds = new FileSystemAdapter<Fixture>("saved-sounds", baseDir);

		await projects.set({ key: "a", value: { name: "p", value: 1 } });
		await sounds.set({ key: "a", value: { name: "s", value: 2 } });

		expect(await projects.get("a")).toEqual({ id: "a", name: "p", value: 1 });
		expect(await sounds.get("a")).toEqual({ id: "a", name: "s", value: 2 });
	});
});
