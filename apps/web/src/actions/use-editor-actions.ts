"use client";

import { useEffect, useState } from "react";
import { useTimelineStore } from "@/timeline/timeline-store";
import { useActionHandler } from "@/actions/use-action-handler";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import {
	addMediaTime,
	maxMediaTime,
	mediaTime,
	mediaTimeFromSeconds,
	minMediaTime,
	subMediaTime,
	TICKS_PER_SECOND,
	ZERO_MEDIA_TIME,
} from "@/wasm";
import { useKeyframeSelection } from "@/timeline/hooks/element/use-keyframe-selection";
import { getElementsAtTime, hasMediaId } from "@/timeline";
import { cancelInteraction } from "@/editor/cancel-interaction";
import { invokeAction } from "@/actions";
import { canToggleSourceAudio } from "@/timeline/audio-separation";
import {
	activateScope,
	clearActiveScope,
	type ScopeEntry,
} from "@/selection/scope";
import { useCommittedRef } from "@/hooks/use-committed-ref";
import * as handlers from "@/actions/handlers";

export function useEditorActions() {
	const editor = useEditor();
	const { selectedElements, setElementSelection } = useElementSelection();
	const { selectedKeyframes, clearKeyframeSelection } = useKeyframeSelection();
	const selectedMaskPointSelection = useEditor((e) =>
		e.selection.getSelectedMaskPointSelection(),
	);
	const toggleSnapping = useTimelineStore((s) => s.toggleSnapping);
	const rippleEditingEnabled = useTimelineStore((s) => s.rippleEditingEnabled);
	const toggleRippleEditing = useTimelineStore((s) => s.toggleRippleEditing);
	const hasTimelineSelection =
		selectedElements.length > 0 ||
		selectedKeyframes.length > 0 ||
		selectedMaskPointSelection !== null;
	const hasTimelineSelectionRef = useCommittedRef(hasTimelineSelection);
	const clearTimelineSelectionRef = useCommittedRef(() => {
		editor.selection.clearSelection();
	});
	const clearTimelineActiveSelectionRef = useCommittedRef(() => {
		editor.selection.clearMostSpecificSelection();
	});
	const [timelineScope] = useState<ScopeEntry>(() => ({
		hasSelection: () => hasTimelineSelectionRef.current,
		clear: () => {
			clearTimelineSelectionRef.current();
		},
		clearActive: () => {
			clearTimelineActiveSelectionRef.current();
		},
	}));

	useEffect(() => {
		if (!hasTimelineSelection) {
			return;
		}

		return activateScope({ entry: timelineScope });
	}, [hasTimelineSelection, timelineScope]);

	useActionHandler(
		"toggle-play",
		() => {
			editor.playback.toggle();
		},
		undefined,
	);

	useActionHandler(
		"stop-playback",
		() => {
			if (editor.playback.getIsPlaying()) {
				editor.playback.toggle();
			}
			editor.playback.seek({ time: ZERO_MEDIA_TIME });
		},
		undefined,
	);

	useActionHandler(
		"seek-forward",
		(args) => {
			const seconds = args?.seconds ?? 1;
			const delta = mediaTimeFromSeconds({ seconds });
			editor.playback.seek({
				time: minMediaTime({
					a: editor.timeline.getTotalDuration(),
					b: addMediaTime({
						a: editor.playback.getCurrentTime(),
						b: delta,
					}),
				}),
			});
		},
		undefined,
	);

	useActionHandler(
		"seek-backward",
		(args) => {
			const seconds = args?.seconds ?? 1;
			const delta = mediaTimeFromSeconds({ seconds });
			editor.playback.seek({
				time: maxMediaTime({
					a: ZERO_MEDIA_TIME,
					b: subMediaTime({
						a: editor.playback.getCurrentTime(),
						b: delta,
					}),
				}),
			});
		},
		undefined,
	);

	useActionHandler(
		"frame-step-forward",
		() => {
			const fps = editor.project.getActive().settings.fps;
			const ticksPerFrame = mediaTime({
				ticks: Math.round(
					(TICKS_PER_SECOND * fps.denominator) / fps.numerator,
				),
			});
			editor.playback.seek({
				time: minMediaTime({
					a: editor.timeline.getTotalDuration(),
					b: addMediaTime({
						a: editor.playback.getCurrentTime(),
						b: ticksPerFrame,
					}),
				}),
			});
		},
		undefined,
	);

	useActionHandler(
		"frame-step-backward",
		() => {
			const fps = editor.project.getActive().settings.fps;
			const ticksPerFrame = mediaTime({
				ticks: Math.round(
					(TICKS_PER_SECOND * fps.denominator) / fps.numerator,
				),
			});
			editor.playback.seek({
				time: maxMediaTime({
					a: ZERO_MEDIA_TIME,
					b: subMediaTime({
						a: editor.playback.getCurrentTime(),
						b: ticksPerFrame,
					}),
				}),
			});
		},
		undefined,
	);

	useActionHandler(
		"jump-forward",
		(args) => {
			const seconds = args?.seconds ?? 5;
			const delta = mediaTimeFromSeconds({ seconds });
			editor.playback.seek({
				time: minMediaTime({
					a: editor.timeline.getTotalDuration(),
					b: addMediaTime({
						a: editor.playback.getCurrentTime(),
						b: delta,
					}),
				}),
			});
		},
		undefined,
	);

	useActionHandler(
		"jump-backward",
		(args) => {
			const seconds = args?.seconds ?? 5;
			const delta = mediaTimeFromSeconds({ seconds });
			editor.playback.seek({
				time: maxMediaTime({
					a: ZERO_MEDIA_TIME,
					b: subMediaTime({
						a: editor.playback.getCurrentTime(),
						b: delta,
					}),
				}),
			});
		},
		undefined,
	);

	useActionHandler(
		"goto-start",
		() => {
			editor.playback.seek({ time: ZERO_MEDIA_TIME });
		},
		undefined,
	);

	useActionHandler(
		"goto-end",
		() => {
			editor.playback.seek({ time: editor.timeline.getTotalDuration() });
		},
		undefined,
	);

	useActionHandler(
		"split",
		() => {
			const currentTime = editor.playback.getCurrentTime();
			const tracks = editor.scenes.getActiveScene().tracks;
			const elementsToSplit =
				selectedElements.length > 0
					? selectedElements
					: getElementsAtTime({
							tracks,
							time: currentTime,
						});

			if (elementsToSplit.length === 0) return;

			editor.timeline.splitElements({
				elements: elementsToSplit,
				splitTime: currentTime,
			});
		},
		undefined,
	);

	useActionHandler(
		"split-left",
		() => {
			const currentTime = editor.playback.getCurrentTime();
			const tracks = editor.scenes.getActiveScene().tracks;
			const elementsToSplit =
				selectedElements.length > 0
					? selectedElements
					: getElementsAtTime({
							tracks,
							time: currentTime,
						});

			if (elementsToSplit.length === 0) return;

			const rightSideElements = editor.timeline.splitElements({
				elements: elementsToSplit,
				splitTime: currentTime,
				retainSide: "right",
			});

			if (rippleEditingEnabled && rightSideElements.length > 0) {
				const firstRightElement = editor.timeline.getElementsWithTracks({
					elements: [rightSideElements[0]],
				})[0];
				if (firstRightElement) {
					editor.playback.seek({ time: firstRightElement.element.startTime });
				}
			}
		},
		undefined,
	);

	useActionHandler(
		"split-right",
		() => {
			const currentTime = editor.playback.getCurrentTime();
			const tracks = editor.scenes.getActiveScene().tracks;
			const elementsToSplit =
				selectedElements.length > 0
					? selectedElements
					: getElementsAtTime({
							tracks,
							time: currentTime,
						});

			if (elementsToSplit.length === 0) return;

			editor.timeline.splitElements({
				elements: elementsToSplit,
				splitTime: currentTime,
				retainSide: "left",
			});
		},
		undefined,
	);

	useActionHandler(
		"delete-selected",
		() => {
			switch (editor.selection.getActiveSelectionKind()) {
				case "mask-points":
					if (!selectedMaskPointSelection) {
						return;
					}
					editor.timeline.deleteFreeformPathMaskPoints({
						trackId: selectedMaskPointSelection.trackId,
						elementId: selectedMaskPointSelection.elementId,
						maskId: selectedMaskPointSelection.maskId,
						pointIds: selectedMaskPointSelection.pointIds,
					});
					return;
				case "keyframes":
					if (selectedKeyframes.length === 0) {
						return;
					}
					editor.timeline.removeKeyframes({ keyframes: selectedKeyframes });
					clearKeyframeSelection();
					return;
				case "elements":
					if (selectedElements.length === 0) {
						return;
					}
					editor.timeline.deleteElements({
						elements: selectedElements,
					});
					return;
				default:
					return;
			}
		},
		undefined,
	);

	useActionHandler(
		"toggle-source-audio",
		() => {
			if (selectedElements.length !== 1) {
				return;
			}

			const selectedElement = editor.timeline.getElementsWithTracks({
				elements: selectedElements,
			})[0];
			if (!selectedElement) {
				return;
			}

			const mediaAsset = (() => {
				const { element } = selectedElement;
				if (!hasMediaId(element)) {
					return null;
				}

				return (
					editor.media
						.getAssets()
						.find((asset) => asset.id === element.mediaId) ?? null
				);
			})();
			if (!canToggleSourceAudio(selectedElement.element, mediaAsset)) {
				return;
			}

			editor.timeline.toggleSourceAudioSeparation({
				trackId: selectedElement.track.id,
				elementId: selectedElement.element.id,
			});
		},
		undefined,
	);

	useActionHandler(
		"select-all",
		() => {
			const scene = editor.scenes.getActiveScene();
			const allElements = [
				...scene.tracks.overlay,
				scene.tracks.main,
				...scene.tracks.audio,
			].flatMap((track) =>
				track.elements.map((element) => ({
					trackId: track.id,
					elementId: element.id,
				})),
			);
			setElementSelection({ elements: allElements });
		},
		undefined,
	);

	useActionHandler(
		"cancel-interaction",
		() => {
			if (!cancelInteraction()) {
				invokeAction("deselect-all");
			}
		},
		undefined,
	);

	useActionHandler(
		"deselect-all",
		() => {
			if (!clearActiveScope()) {
				editor.selection.clearMostSpecificSelection();
			}
		},
		undefined,
	);

	useActionHandler(
		"duplicate-selected",
		() => {
			editor.timeline.duplicateElements({
				elements: selectedElements,
			});
		},
		undefined,
	);

	useActionHandler(
		"toggle-elements-muted-selected",
		() => {
			editor.timeline.toggleElementsMuted({ elements: selectedElements });
		},
		undefined,
	);

	useActionHandler(
		"toggle-elements-visibility-selected",
		() => {
			editor.timeline.toggleElementsVisibility({ elements: selectedElements });
		},
		undefined,
	);

	useActionHandler(
		"toggle-bookmark",
		() => {
			editor.scenes.toggleBookmark({ time: editor.playback.getCurrentTime() });
		},
		undefined,
	);

	useActionHandler(
		"copy-selected",
		() => {
			editor.clipboard.copy();
		},
		undefined,
	);

	useActionHandler(
		"paste-copied",
		() => {
			editor.clipboard.paste();
		},
		undefined,
	);

	useActionHandler(
		"toggle-snapping",
		() => {
			toggleSnapping();
		},
		undefined,
	);

	useActionHandler(
		"toggle-ripple-editing",
		() => {
			toggleRippleEditing();
		},
		undefined,
	);

	useActionHandler(
		"undo",
		() => {
			editor.command.undo();
		},
		undefined,
	);

	useActionHandler(
		"redo",
		() => {
			editor.command.redo();
		},
		undefined,
	);

	// todo: potnetially unify these two actions:
	useActionHandler(
		"remove-media-asset",
		(args) => {
			if (!args) return;
			editor.media.removeMediaAsset({
				projectId: args.projectId,
				id: args.assetId,
			});
		},
		undefined,
	);

	useActionHandler(
		"remove-media-assets",
		(args) => {
			if (!args) return;
			editor.media.removeMediaAssets({
				projectId: args.projectId,
				ids: args.assetIds,
			});
		},
		undefined,
	);

	useActionHandler(
		"export-project",
		(args) => {
			if (!args) return;
			// Fire-and-forget: progress/result are observed via
			// editor.project.getExportState(), same as the export UI does —
			// keeps this handler's signature consistent with every other
			// action handler (void, not a returned Promise).
			handlers.exportProject(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"create-project",
		(args) => {
			if (!args) return;
			// Fire-and-forget, like export-project: the new project's id/state
			// is observed via editor.project.getActive() after this resolves.
			handlers.createProject(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"load-project",
		(args) => {
			if (!args) return;
			handlers.loadProject(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"save-project",
		() => {
			handlers.saveProject(editor);
		},
		undefined,
	);

	useActionHandler(
		"update-project-settings",
		(args) => {
			if (!args) return;
			handlers.updateProjectSettings(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"add-clip-effect",
		(args) => {
			if (!args) return;
			handlers.addClipEffect(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"remove-clip-effect",
		(args) => {
			if (!args) return;
			handlers.removeClipEffect(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"toggle-clip-effect",
		(args) => {
			if (!args) return;
			handlers.toggleClipEffect(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"reorder-clip-effects",
		(args) => {
			if (!args) return;
			handlers.reorderClipEffects(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"update-clip-effect-params",
		(args) => {
			if (!args) return;
			handlers.updateClipEffectParams(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"upsert-keyframe",
		(args) => {
			if (!args) return;
			handlers.upsertKeyframe(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"retime-keyframe",
		(args) => {
			if (!args) return;
			handlers.retimeKeyframe(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"update-keyframe-curve",
		(args) => {
			if (!args) return;
			handlers.updateKeyframeCurve(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"upsert-effect-param-keyframe",
		(args) => {
			if (!args) return;
			handlers.upsertEffectParamKeyframe(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"remove-effect-param-keyframe",
		(args) => {
			if (!args) return;
			handlers.removeEffectParamKeyframe(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"remove-mask",
		(args) => {
			if (!args) return;
			handlers.removeMask(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"toggle-mask-inverted",
		(args) => {
			if (!args) return;
			handlers.toggleMaskInverted(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"insert-freeform-path-mask-point",
		(args) => {
			if (!args) return;
			handlers.insertFreeformPathMaskPoint(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"create-scene",
		(args) => {
			if (!args) return;
			handlers.createScene(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"delete-scene",
		(args) => {
			if (!args) return;
			handlers.deleteScene(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"rename-scene",
		(args) => {
			if (!args) return;
			handlers.renameScene(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"switch-scene",
		(args) => {
			if (!args) return;
			handlers.switchScene(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"remove-bookmark",
		(args) => {
			if (!args) return;
			handlers.removeBookmark(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"update-bookmark",
		(args) => {
			if (!args) return;
			handlers.updateBookmark(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"move-bookmark",
		(args) => {
			if (!args) return;
			handlers.moveBookmark(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"add-track",
		(args) => {
			if (!args) return;
			handlers.addTrack(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"remove-track",
		(args) => {
			if (!args) return;
			handlers.removeTrack(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"toggle-track-mute",
		(args) => {
			if (!args) return;
			handlers.toggleTrackMute(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"toggle-track-visibility",
		(args) => {
			if (!args) return;
			handlers.toggleTrackVisibility(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"rename-project",
		(args) => {
			if (!args) return;
			handlers.renameProject(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"duplicate-projects",
		(args) => {
			if (!args) return;
			handlers.duplicateProjects(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"delete-projects",
		(args) => {
			if (!args) return;
			handlers.deleteProjects(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"update-project-thumbnail",
		(args) => {
			if (!args) return;
			handlers.updateProjectThumbnail(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"close-project",
		() => {
			handlers.closeProject(editor);
		},
		undefined,
	);

	useActionHandler(
		"insert-element",
		(args) => {
			if (!args) return;
			handlers.insertElement(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"update-element-trim",
		(args) => {
			if (!args) return;
			handlers.updateElementTrim(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"update-element-retime",
		(args) => {
			if (!args) return;
			handlers.updateElementRetime(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"move-elements",
		(args) => {
			if (!args) return;
			handlers.moveElements(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"update-elements",
		(args) => {
			if (!args) return;
			handlers.updateElements(editor, args);
		},
		undefined,
	);

	useActionHandler(
		"insert-captions-as-text-track",
		(args) => {
			if (!args) return;
			handlers.insertCaptionsAsTextTrack(editor, args);
		},
		undefined,
	);
}
