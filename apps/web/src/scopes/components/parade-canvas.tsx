"use client";

import { useEffect, useRef } from "react";
import type { ScopeParade } from "@/scopes/types";

const CHANNELS = [
	{ key: "redByColumn" as const, tint: [255, 60, 60] as const },
	{ key: "greenByColumn" as const, tint: [60, 255, 60] as const },
	{ key: "blueByColumn" as const, tint: [60, 100, 255] as const },
];

/**
 * A parade is three waveform-style density plots side by side, one per
 * R/G/B channel instead of luma -- structurally the display-side
 * equivalent of parade.rs being waveform.rs generalized to three channels.
 * Each channel's [column][value] counts render the same way
 * WaveformCanvas renders lumaByColumn, just tinted to its own channel
 * color and laid out in a horizontal strip.
 */
export function ParadeCanvas({ parade }: { parade: ScopeParade }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const width = parade.width;
		const height = 256;
		if (width === 0) return;

		let maxCount = 1;
		for (const { key } of CHANNELS) {
			for (const column of parade[key]) {
				for (const count of column) {
					if (count > maxCount) maxCount = count;
				}
			}
		}

		const offscreen = document.createElement("canvas");
		offscreen.width = width * 3;
		offscreen.height = height;
		const offscreenCtx = offscreen.getContext("2d");
		if (!offscreenCtx) return;

		const imageData = offscreenCtx.createImageData(width * 3, height);
		CHANNELS.forEach(({ key, tint }, channelIndex) => {
			const columns = parade[key];
			const xOffset = channelIndex * width;
			for (let x = 0; x < width; x++) {
				const column = columns[x];
				if (!column) continue;
				for (let value = 0; value < height; value++) {
					const count = column[value] ?? 0;
					const intensity = Math.min(1, Math.sqrt(count / maxCount));
					const y = height - 1 - value;
					const pixelIndex = (y * (width * 3) + (xOffset + x)) * 4;
					imageData.data[pixelIndex] = Math.round(intensity * tint[0]);
					imageData.data[pixelIndex + 1] = Math.round(intensity * tint[1]);
					imageData.data[pixelIndex + 2] = Math.round(intensity * tint[2]);
					imageData.data[pixelIndex + 3] = intensity > 0 ? 255 : 0;
				}
			}
		});
		offscreenCtx.putImageData(imageData, 0, 0);

		const displayWidth = canvas.clientWidth || width * 3;
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

		// Thin separators between the three channel strips.
		ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
		ctx.lineWidth = 1;
		for (let divider = 1; divider < 3; divider++) {
			const x = (canvas.width / 3) * divider;
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, canvas.height);
			ctx.stroke();
		}
	}, [parade]);

	return (
		<canvas
			ref={canvasRef}
			className="h-full w-full rounded-md bg-black"
			role="img"
			aria-label="RGB parade: per-channel value distribution per horizontal frame position"
		/>
	);
}
