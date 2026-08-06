/**
 * Headless runner (Goal 2b, HEADLESS_DESIGN.md). Loads or creates a
 * project, runs an ordered list of {action, args} steps against it through
 * the same ACTION_HANDLERS registry use-editor-actions.ts uses for the UI,
 * then exits. No browser, no server — the "transport" is just this script
 * plus a steps file, per HEADLESS_DESIGN.md's transport decision.
 *
 * Usage:
 *   bun run --preload ./headless/wasm-bindgen-bun-plugin.ts headless/run.ts \
 *     --project <projectId | new:ProjectName> --steps <path-to-steps.json>
 *
 * steps.json shape: an array of { "action": "<TAction>", "args"?: {...} }
 * objects, run in order. "action" must be a key of ACTION_HANDLERS —
 * i.e. one of the Actions extracted into src/actions/handlers.ts (the
 * ~39 handlers with no React-only closures; see that file's docstring).
 * Actions outside that set aren't runnable headlessly yet.
 *
 * File-valued args (e.g. add-media-asset's `asset.file: File`) can't be
 * expressed in plain JSON. Anywhere in a step's args, write
 * { "$file": "/absolute/path/on/disk" } and the runner resolves it into a
 * real File (name = the path's basename, bytes read from disk) before
 * dispatch — recursively, so it works nested inside "asset" or similar.
 *
 * The literal string "$currentProjectId" anywhere in a step's args is
 * replaced with the project id this run created/loaded — steps.json can't
 * know that id ahead of time when --project starts with "new:".
 */
import { EditorCore } from "@/core";
import { ACTION_HANDLERS } from "@/actions/handlers";

interface Step {
	action: string;
	args?: unknown;
}

function parseArgs(argv: string[]): { project: string; stepsPath: string } {
	const projectIndex = argv.indexOf("--project");
	const stepsIndex = argv.indexOf("--steps");
	if (projectIndex === -1 || stepsIndex === -1) {
		throw new Error(
			"Usage: run.ts --project <projectId | new:ProjectName> --steps <path>",
		);
	}
	return { project: argv[projectIndex + 1], stepsPath: argv[stepsIndex + 1] };
}

async function resolveStepArgs(
	value: unknown,
	currentProjectId: string,
): Promise<unknown> {
	if (value === "$currentProjectId") {
		return currentProjectId;
	}
	if (Array.isArray(value)) {
		return Promise.all(
			value.map((entry) => resolveStepArgs(entry, currentProjectId)),
		);
	}
	if (value !== null && typeof value === "object") {
		const record = value as Record<string, unknown>;
		if (typeof record.$file === "string") {
			const path = record.$file;
			const bytes = await Bun.file(path).arrayBuffer();
			return new File([bytes], path.split("/").at(-1) ?? path);
		}
		const resolved: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(record)) {
			resolved[key] = await resolveStepArgs(entry, currentProjectId);
		}
		return resolved;
	}
	return value;
}

async function loadSteps(path: string): Promise<Step[]> {
	const file = Bun.file(path);
	const parsed: unknown = await file.json();
	if (!Array.isArray(parsed)) {
		throw new Error(`${path} must contain a JSON array of steps`);
	}
	return parsed.map((entry, index) => {
		if (
			typeof entry !== "object" ||
			entry === null ||
			typeof (entry as { action?: unknown }).action !== "string"
		) {
			throw new Error(`Step ${index} is missing a string "action" field`);
		}
		return entry as Step;
	});
}

async function main() {
	const { project, stepsPath } = parseArgs(Bun.argv.slice(2));
	const editor = EditorCore.getInstance();

	let projectId: string;
	if (project.startsWith("new:")) {
		projectId = await editor.project.createNewProject({
			name: project.slice("new:".length),
		});
		console.log(`[run] created project ${projectId}`);
	} else {
		await editor.project.loadProject({ id: project });
		projectId = project;
		console.log(`[run] loaded project ${projectId}`);
	}

	const steps = await loadSteps(stepsPath);
	for (const [index, step] of steps.entries()) {
		const handler = ACTION_HANDLERS[step.action];
		if (!handler) {
			throw new Error(
				`Step ${index}: unknown or not-yet-headless-runnable action "${step.action}"`,
			);
		}
		console.log(`[run] step ${index}: ${step.action}`);
		const resolvedArgs = await resolveStepArgs(step.args, projectId);
		// biome-ignore lint: args are validated by each handler's own manager call, not statically here
		await handler(editor, resolvedArgs as never);
	}

	// SaveManager debounces auto-save (~800ms) — a one-shot process must not
	// exit before a save this script didn't explicitly wait for. If the
	// step list already ends in "save-project", this is a harmless extra
	// beat; if it doesn't, this is what makes the run correct rather than
	// racy. See HEADLESS_DESIGN.md's "Auto-save timing matters" section.
	await editor.project.saveCurrentProject();
	console.log(`[run] done — project ${projectId} saved`);
}

main().catch((error) => {
	console.error("[run] FAILED:", error);
	process.exit(1);
});
