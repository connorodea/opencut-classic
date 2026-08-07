/**
 * Headless proof for Goal 4b's first slice: the primary-wheels Action
 * surface (state layer only — rendering verification is the separate
 * rust/crates/effects/tests/primary_wheels.rs pixel test, per
 * COLOR_GRADING_DESIGN.md's explicit "state persistence != visual
 * correctness" note). Creates a project, inserts a text element, adds a
 * primary-wheels effect with real lift/gamma/gain/offset values via the
 * existing add-clip-effect Action, saves, resets the process, reloads,
 * and confirms the effect + its params persisted exactly.
 *
 *   bun run --preload ./headless/wasm-bindgen-bun-plugin.ts headless/primary-wheels-proof.ts
 */
import { EditorCore } from "@/core";
import { ACTION_HANDLERS } from "@/actions/handlers";
import { buildTextElement } from "@/timeline/element-utils";
import { mediaTimeFromSeconds } from "@/wasm";
import type { Effect } from "@/effects/types";

function getEffects(element: unknown): Effect[] {
	if (
		typeof element === "object" &&
		element !== null &&
		"effects" in element &&
		Array.isArray((element as { effects?: unknown }).effects)
	) {
		return (element as { effects: Effect[] }).effects;
	}
	return [];
}

async function main() {
	const editor = EditorCore.getInstance();

	const projectId = await editor.project.createNewProject({
		name: "Primary Wheels Proof",
	});
	console.log("[ok] created project:", projectId);

	const element = buildTextElement({
		raw: { name: "Test clip" },
		startTime: mediaTimeFromSeconds({ seconds: 0 }),
	});

	editor.timeline.insertElement({
		element,
		placement: { mode: "auto", trackType: "text" },
	});

	const sceneAfterInsert = editor.scenes.getActiveSceneOrNull();
	const insertedElement = sceneAfterInsert?.tracks.overlay
		.flatMap((track) => track.elements.map((el) => ({ trackId: track.id, el })))
		.find(({ el }) => el.name === "Test clip");

	if (!insertedElement) {
		throw new Error("FAIL: inserted text element not found in scene state");
	}
	const { trackId, el: timelineElement } = insertedElement;
	console.log(
		"[ok] inserted element:",
		timelineElement.id,
		"on track",
		trackId,
	);

	const wheelsArgs = {
		trackId,
		elementId: timelineElement.id,
		effectType: "primary-wheels",
	};
	ACTION_HANDLERS["add-clip-effect"](editor, wheelsArgs as never);

	const sceneAfterEffect = editor.scenes.getActiveSceneOrNull();
	const effectId = getEffects(
		sceneAfterEffect?.tracks.overlay
			.find((t) => t.id === trackId)
			?.elements.find((el) => el.id === timelineElement.id),
	)[0]?.id;

	if (!effectId) {
		throw new Error("FAIL: primary-wheels effect not found after add-clip-effect");
	}
	console.log("[ok] added primary-wheels effect:", effectId);

	const grade = { lift: 0.15, gamma: 1.3, gain: 1.05, offset: -0.02 };
	ACTION_HANDLERS["update-clip-effect-params"](editor, {
		trackId,
		elementId: timelineElement.id,
		effectId,
		params: grade,
	} as never);

	await editor.project.saveCurrentProject();
	console.log("[ok] saved project");

	EditorCore.reset();
	const editor2 = EditorCore.getInstance();
	await editor2.project.loadProject({ id: projectId });

	const reloadedScene = editor2.scenes.getActiveSceneOrNull();
	const reloadedEffect = getEffects(
		reloadedScene?.tracks.overlay
			.find((t) => t.id === trackId)
			?.elements.find((el) => el.id === timelineElement.id),
	).find((e) => e.id === effectId);

	if (!reloadedEffect) {
		throw new Error("FAIL: primary-wheels effect did not survive save+reload");
	}

	const paramsMatch =
		reloadedEffect.type === "primary-wheels" &&
		reloadedEffect.params.lift === grade.lift &&
		reloadedEffect.params.gamma === grade.gamma &&
		reloadedEffect.params.gain === grade.gain &&
		reloadedEffect.params.offset === grade.offset;

	console.log(
		paramsMatch ? "[ok]" : "[FAIL]",
		"effect type + all four grade params persisted through save+reload:",
		JSON.stringify(reloadedEffect.params),
	);

	if (!paramsMatch) {
		process.exit(1);
	}
}

main().catch((error) => {
	console.error("[FAIL] unhandled error:", error);
	process.exit(1);
});
