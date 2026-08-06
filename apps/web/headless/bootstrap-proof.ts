/**
 * Proof-of-concept for Goal 2b (see HEADLESS_DESIGN.md v1.3): EditorCore
 * runs outside a browser, with real Action-equivalent mutation and
 * persistence, given the WASM plugin below. Run with:
 *
 *   bun run --preload ./headless/wasm-bindgen-bun-plugin.ts headless/bootstrap-proof.ts
 *
 * Uses editor.project.updateSettings (the manager method
 * update-project-settings wraps) rather than addTrack: an earlier version
 * of this script used addTrack and saw the new track vanish by save time,
 * which looked like a headless-specific bug but wasn't — EditorCore
 * registers a reactor (apps/web/src/core/index.ts) that prunes any overlay/
 * audio track with zero elements after every command, by design, so an
 * empty track added and never populated doesn't survive regardless of
 * browser vs. headless. Confirmed by calling AddTrackCommand.execute()
 * directly (bypassing CommandManager, and therefore the reactor) and
 * seeing the track persist fine. updateSettings isn't subject to that
 * pruning, so it's the honest way to prove the save/reload path works.
 */
import { EditorCore } from "@/core";
import { floatToFrameRate, frameRateToFloat } from "@/fps/utils";

async function main() {
	const editor = EditorCore.getInstance();

	const projectId = await editor.project.createNewProject({
		name: "Headless Bootstrap Proof",
	});
	console.log("[ok] created project:", projectId);

	editor.project.updateSettings({ settings: { fps: floatToFrameRate(25) } });
	console.log("[ok] updated fps to 25 in-memory");

	await editor.project.saveCurrentProject();
	console.log("[ok] saved project");

	// Simulate a fresh process picking the project back up.
	EditorCore.reset();
	const editor2 = EditorCore.getInstance();
	await editor2.project.loadProject({ id: projectId });
	const reloaded = editor2.project.getActive();

	const idMatches = reloaded.metadata.id === projectId;
	console.log(idMatches ? "[ok]" : "[FAIL]", "reloaded project id matches:", idMatches);

	const fpsMatches = frameRateToFloat(reloaded.settings.fps) === 25;
	console.log(
		fpsMatches ? "[ok]" : "[FAIL]",
		"fps change persisted through save+reload:",
		frameRateToFloat(reloaded.settings.fps),
	);
}

main().catch((error) => {
	console.error("[FAIL] unhandled error:", error);
	process.exit(1);
});
