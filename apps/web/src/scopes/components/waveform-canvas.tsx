"use client";

import { useEffect, useRef } from "react";
import type { ScopeWaveform } from "@/scopes/types";

/**
 * Waveform (and parade/vectorscope, see the sibling files) are 2D density
 * maps -- per-pixel intensity data, not a handful of XY series -- so they
 * render as a raw canvas bitmap rather than an SVG chart library, matching
 * how real NLE scope monitors actually draw them.
 *
 * Renders lumaByColumn's [column][lumaLevel] counts into an offscreen
 * ImageData buffer at native resolution (width x 256), then scales it up
 * to fill the display canvas. Row 0 of lumaByColumn is luma level 0
 * (black); ImageData row 0 is the top of the image -- so this flips
 * vertically, matching the waveform-monitor convention of brightness
 * increasing upward.
 */
export function WaveformCanvas({ waveform }: { waveform: ScopeWaveform }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const width = waveform.width;
		const height = 256;
		if (width === 0) return;

		const offscreen = document.createElement("canvas");
		offscreen.width = width;
		offscreen.height = height;
		const offscreenCtx = offscreen.getContext("2d");
		if (!offscreenCtx) return;

		let maxCount = 1;
		for (const column of waveform.lumaByColumn) {
			for (const count of column) {
				if (count > maxCount) maxCount = count;
			}
		}

		const imageData = offscreenCtx.createImageData(width, height);
		for (let x = 0; x < width; x++) {
			const column = waveform.lumaByColumn[x];
			if (!column) continue;
			for (let lumaLevel = 0; lumaLevel < height; lumaLevel++) {
				const count = column[lumaLevel] ?? 0;
				// sqrt gain: makes low-count regions visible without a single
				// spike dominating the display, matching a typical waveform
				// monitor's default gain curve.
				const intensity = Math.min(1, Math.sqrt(count / maxCount));
				const y = height - 1 - lumaLevel; // flip: luma 255 at top
				const pixelIndex = (y * width + x) * 4;
				imageData.data[pixelIndex] = Math.round(intensity * 180);
				imageData.data[pixelIndex + 1] = Math.round(intensity * 255);
				imageData.data[pixelIndex + 2] = Math.round(intensity * 180);
				imageData.data[pixelIndex + 3] = intensity > 0 ? 255 : 0;
			}
		}
		offscreenCtx.putImageData(imageData, 0, 0);

		const displayWidth = canvas.clientWidth || width;
		const displayHeight = canvas.clientHeight || height;
		const dpr = window.devicePixelRatio || 1;
		canvas.width = displayWidth * dpr;
		canvas.height = displayHeight * dpr;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.fillStyle = "#000000";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.imageSmoothingEnabled = true;
		ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
	}, [waveform]);

	return (
		<canvas
			ref={canvasRef}
			className="h-full w-full rounded-md bg-black"
			role="img"
			aria-label="Waveform scope: luma distribution per horizontal frame position"
		/>
	);
}
