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
		// biome-ignore lint: args are validated by each handler's own manager call, not statically here
		await handler(editor, step.args as never);
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
