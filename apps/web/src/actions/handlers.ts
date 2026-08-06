import type { EditorCore } from "@/core";
import { insertCaptionChunksAsTextTrack } from "@/subtitles/insert";
import type { TActionArgsMap } from "./types";

/**
 * Plain, React-free bodies for the Action handlers that don't close over any
 * component-local state (selection, refs, etc.) — see HEADLESS_DESIGN.md's
 * v1.3 section. use-editor-actions.ts registers these same functions via
 * useActionHandler for the UI; the headless runner (headless/run.ts) calls
 * them directly through ACTION_HANDLERS below, with no React involved.
 *
 * Every handler here is a one-line call into a manager method the earlier
 * gap-closure work (GAP_MAP.md) already registered as an Action — this file
 * doesn't add behavior, it relocates it so it's callable from two places.
 */

export function exportProject(
	editor: EditorCore,
	args: TActionArgsMap["export-project"],
): void {
	void editor.project.export({
		options: {
			format: args.format,
			quality: args.quality,
			fps: args.fps,
			includeAudio: args.includeAudio,
		},
	});
}

export function createProject(
	editor: EditorCore,
	args: TActionArgsMap["create-project"],
): void {
	void editor.project.createNewProject({ name: args.name });
}

export function loadProject(
	editor: EditorCore,
	args: TActionArgsMap["load-project"],
): void {
	void editor.project.loadProject({ id: args.id });
}

export function saveProject(editor: EditorCore): void {
	void editor.project.saveCurrentProject();
}

export function updateProjectSettings(
	editor: EditorCore,
	args: TActionArgsMap["update-project-settings"],
): void {
	editor.project.updateSettings({ settings: args.settings });
}

export function addClipEffect(
	editor: EditorCore,
	args: TActionArgsMap["add-clip-effect"],
): void {
	editor.timeline.addClipEffect({
		trackId: args.trackId,
		elementId: args.elementId,
		effectType: args.effectType,
	});
}

export function removeClipEffect(
	editor: EditorCore,
	args: TActionArgsMap["remove-clip-effect"],
): void {
	editor.timeline.removeClipEffect({
		trackId: args.trackId,
		elementId: args.elementId,
		effectId: args.effectId,
	});
}

export function toggleClipEffect(
	editor: EditorCore,
	args: TActionArgsMap["toggle-clip-effect"],
): void {
	editor.timeline.toggleClipEffect({
		trackId: args.trackId,
		elementId: args.elementId,
		effectId: args.effectId,
	});
}

export function reorderClipEffects(
	editor: EditorCore,
	args: TActionArgsMap["reorder-clip-effects"],
): void {
	editor.timeline.reorderClipEffects({
		trackId: args.trackId,
		elementId: args.elementId,
		fromIndex: args.fromIndex,
		toIndex: args.toIndex,
	});
}

export function updateClipEffectParams(
	editor: EditorCore,
	args: TActionArgsMap["update-clip-effect-params"],
): void {
	editor.timeline.updateClipEffectParams({
		trackId: args.trackId,
		elementId: args.elementId,
		effectId: args.effectId,
		params: args.params,
	});
}

export function upsertKeyframe(
	editor: EditorCore,
	args: TActionArgsMap["upsert-keyframe"],
): void {
	editor.timeline.upsertKeyframes({ keyframes: [args] });
}

export function retimeKeyframe(
	editor: EditorCore,
	args: TActionArgsMap["retime-keyframe"],
): void {
	editor.timeline.retimeKeyframe({
		trackId: args.trackId,
		elementId: args.elementId,
		propertyPath: args.propertyPath,
		keyframeId: args.keyframeId,
		time: args.time,
	});
}

export function updateKeyframeCurve(
	editor: EditorCore,
	args: TActionArgsMap["update-keyframe-curve"],
): void {
	editor.timeline.updateKeyframeCurves({ keyframes: [args] });
}

export function upsertEffectParamKeyframe(
	editor: EditorCore,
	args: TActionArgsMap["upsert-effect-param-keyframe"],
): void {
	editor.timeline.upsertEffectParamKeyframe({
		trackId: args.trackId,
		elementId: args.elementId,
		effectId: args.effectId,
		paramKey: args.paramKey,
		time: args.time,
		value: args.value,
		interpolation: args.interpolation,
		keyframeId: args.keyframeId,
	});
}

export function removeEffectParamKeyframe(
	editor: EditorCore,
	args: TActionArgsMap["remove-effect-param-keyframe"],
): void {
	editor.timeline.removeEffectParamKeyframe({
		trackId: args.trackId,
		elementId: args.elementId,
		effectId: args.effectId,
		paramKey: args.paramKey,
		keyframeId: args.keyframeId,
	});
}

export function removeMask(
	editor: EditorCore,
	args: TActionArgsMap["remove-mask"],
): void {
	editor.timeline.removeMask({
		trackId: args.trackId,
		elementId: args.elementId,
		maskId: args.maskId,
	});
}

export function toggleMaskInverted(
	editor: EditorCore,
	args: TActionArgsMap["toggle-mask-inverted"],
): void {
	editor.timeline.toggleMaskInverted({
		trackId: args.trackId,
		elementId: args.elementId,
		maskId: args.maskId,
	});
}

export function insertFreeformPathMaskPoint(
	editor: EditorCore,
	args: TActionArgsMap["insert-freeform-path-mask-point"],
): void {
	editor.timeline.insertFreeformPathMaskPoint({
		trackId: args.trackId,
		elementId: args.elementId,
		maskId: args.maskId,
		segmentIndex: args.segmentIndex,
		canvasPoint: args.canvasPoint,
		bounds: args.bounds,
	});
}

export function createScene(
	editor: EditorCore,
	args: TActionArgsMap["create-scene"],
): void {
	void editor.scenes.createScene({ name: args.name, isMain: args.isMain });
}

export function deleteScene(
	editor: EditorCore,
	args: TActionArgsMap["delete-scene"],
): void {
	void editor.scenes.deleteScene({ sceneId: args.sceneId });
}

export function renameScene(
	editor: EditorCore,
	args: TActionArgsMap["rename-scene"],
): void {
	void editor.scenes.renameScene({ sceneId: args.sceneId, name: args.name });
}

export function switchScene(
	editor: EditorCore,
	args: TActionArgsMap["switch-scene"],
): void {
	void editor.scenes.switchToScene({ sceneId: args.sceneId });
}

export function removeBookmark(
	editor: EditorCore,
	args: TActionArgsMap["remove-bookmark"],
): void {
	void editor.scenes.removeBookmark({ time: args.time });
}

export function updateBookmark(
	editor: EditorCore,
	args: TActionArgsMap["update-bookmark"],
): void {
	void editor.scenes.updateBookmark({ time: args.time, updates: args.updates });
}

export function moveBookmark(
	editor: EditorCore,
	args: TActionArgsMap["move-bookmark"],
): void {
	void editor.scenes.moveBookmark({
		fromTime: args.fromTime,
		toTime: args.toTime,
	});
}

export function addTrack(
	editor: EditorCore,
	args: TActionArgsMap["add-track"],
): void {
	editor.timeline.addTrack({ type: args.type, index: args.index });
}

export function removeTrack(
	editor: EditorCore,
	args: TActionArgsMap["remove-track"],
): void {
	editor.timeline.removeTrack({ trackId: args.trackId });
}

export function toggleTrackMute(
	editor: EditorCore,
	args: TActionArgsMap["toggle-track-mute"],
): void {
	editor.timeline.toggleTrackMute({ trackId: args.trackId });
}

export function toggleTrackVisibility(
	editor: EditorCore,
	args: TActionArgsMap["toggle-track-visibility"],
): void {
	editor.timeline.toggleTrackVisibility({ trackId: args.trackId });
}

export function renameProject(
	editor: EditorCore,
	args: TActionArgsMap["rename-project"],
): void {
	void editor.project.renameProject({ id: args.id, name: args.name });
}

export function duplicateProjects(
	editor: EditorCore,
	args: TActionArgsMap["duplicate-projects"],
): void {
	void editor.project.duplicateProjects({ ids: args.ids });
}

export function deleteProjects(
	editor: EditorCore,
	args: TActionArgsMap["delete-projects"],
): void {
	void editor.project.deleteProjects({ ids: args.ids });
}

export function updateProjectThumbnail(
	editor: EditorCore,
	args: TActionArgsMap["update-project-thumbnail"],
): void {
	void editor.project.updateThumbnail({ thumbnail: args.thumbnail });
}

export function closeProject(editor: EditorCore): void {
	editor.project.closeProject();
}

export function insertElement(
	editor: EditorCore,
	args: TActionArgsMap["insert-element"],
): void {
	editor.timeline.insertElement({
		element: args.element,
		placement: args.placement,
	});
}

export function updateElementTrim(
	editor: EditorCore,
	args: TActionArgsMap["update-element-trim"],
): void {
	editor.timeline.updateElementTrim({
		elementId: args.elementId,
		trimStart: args.trimStart,
		trimEnd: args.trimEnd,
		startTime: args.startTime,
		duration: args.duration,
		pushHistory: args.pushHistory,
	});
}

export function updateElementRetime(
	editor: EditorCore,
	args: TActionArgsMap["update-element-retime"],
): void {
	editor.timeline.updateElementRetime({
		trackId: args.trackId,
		elementId: args.elementId,
		retime: args.retime,
		pushHistory: args.pushHistory,
	});
}

export function moveElements(
	editor: EditorCore,
	args: TActionArgsMap["move-elements"],
): void {
	editor.timeline.moveElements({
		moves: args.moves,
		createTracks: args.createTracks,
	});
}

export function updateElements(
	editor: EditorCore,
	args: TActionArgsMap["update-elements"],
): void {
	editor.timeline.updateElements({
		updates: args.updates,
		pushHistory: args.pushHistory,
	});
}

export function insertCaptionsAsTextTrack(
	editor: EditorCore,
	args: TActionArgsMap["insert-captions-as-text-track"],
): void {
	insertCaptionChunksAsTextTrack({ editor, captions: args.captions });
}

/**
 * Loosely-typed dispatch table for the headless runner, keyed by the exact
 * Action name each function implements. Individual handlers above stay
 * fully typed against TActionArgsMap; this registry's value type is
 * deliberately loose (args come from parsed JSON at the runner's actual
 * call site, not from a typed caller) rather than fighting a mapped type
 * across a heterogeneous, partial set of Actions.
 */
export const ACTION_HANDLERS: Record<
	string,
	(editor: EditorCore, args: never) => void
> = {
	"export-project": exportProject,
	"create-project": createProject,
	"load-project": loadProject,
	"save-project": saveProject,
	"update-project-settings": updateProjectSettings,
	"add-clip-effect": addClipEffect,
	"remove-clip-effect": removeClipEffect,
	"toggle-clip-effect": toggleClipEffect,
	"reorder-clip-effects": reorderClipEffects,
	"update-clip-effect-params": updateClipEffectParams,
	"upsert-keyframe": upsertKeyframe,
	"retime-keyframe": retimeKeyframe,
	"update-keyframe-curve": updateKeyframeCurve,
	"upsert-effect-param-keyframe": upsertEffectParamKeyframe,
	"remove-effect-param-keyframe": removeEffectParamKeyframe,
	"remove-mask": removeMask,
	"toggle-mask-inverted": toggleMaskInverted,
	"insert-freeform-path-mask-point": insertFreeformPathMaskPoint,
	"create-scene": createScene,
	"delete-scene": deleteScene,
	"rename-scene": renameScene,
	"switch-scene": switchScene,
	"remove-bookmark": removeBookmark,
	"update-bookmark": updateBookmark,
	"move-bookmark": moveBookmark,
	"add-track": addTrack,
	"remove-track": removeTrack,
	"toggle-track-mute": toggleTrackMute,
	"toggle-track-visibility": toggleTrackVisibility,
	"rename-project": renameProject,
	"duplicate-projects": duplicateProjects,
	"delete-projects": deleteProjects,
	"update-project-thumbnail": updateProjectThumbnail,
	"close-project": closeProject,
	"insert-element": insertElement,
	"update-element-trim": updateElementTrim,
	"update-element-retime": updateElementRetime,
	"move-elements": moveElements,
	"update-elements": updateElements,
	"insert-captions-as-text-track": insertCaptionsAsTextTrack,
};
