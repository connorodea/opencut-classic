"use client";

import { useEffect, useRef } from "react";
import type { ScopeVectorscope } from "@/scopes/types";

/**
 * Renders the 256x256 Cb/Cr bucket grid as a canvas heatmap (classic
 * green-on-black vectorscope styling), with a center crosshair marking the
 * achromatic point (128, 128) and a reference graticule ring. The ring
 * radius is a display aid, not calibrated against DaVinci's actual 75%/
 * 100% saturation targets or hue-angle color boxes (skin-tone line, R/G/B/
 * Cy/Mg/Ye targets) -- those need real calibration data this pass didn't
 * verify, stated as a scope choice matching vectorscope.rs's own doc
 * comment ("computes the bucket grid only, not hue-angle target overlays").
 */
export function VectorscopeCanvas({
	vectorscope,
}: {
	vectorscope: ScopeVectorscope;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const gridSize = vectorscope.buckets.length;
		if (gridSize === 0) return;

		const offscreen = document.createElement("canvas");
		offscreen.width = gridSize;
		offscreen.height = gridSize;
		const offscreenCtx = offscreen.getContext("2d");
		if (!offscreenCtx) return;

		let maxCount = 1;
		for (const row of vectorscope.buckets) {
			for (const count of row) {
				if (count > maxCount) maxCount = count;
			}
		}

		const imageData = offscreenCtx.createImageData(gridSize, gridSize);
		for (let cb = 0; cb < gridSize; cb++) {
			const row = vectorscope.buckets[cb];
			if (!row) continue;
			for (let cr = 0; cr < gridSize; cr++) {
				const count = row[cr] ?? 0;
				const intensity = Math.min(1, Math.sqrt(count / maxCount));
				// cb is the vertical axis (blue-yellow), cr the horizontal
				// (red-cyan); flip cb so it increases upward like the
				// waveform's luma axis, matching conventional vectorscope
				// orientation.
				const y = gridSize - 1 - cb;
				const x = cr;
				const pixelIndex = (y * gridSize + x) * 4;
				imageData.data[pixelIndex] = Math.round(intensity * 80);
				imageData.data[pixelIndex + 1] = Math.round(intensity * 255);
				imageData.data[pixelIndex + 2] = Math.round(intensity * 80);
				imageData.data[pixelIndex + 3] = intensity > 0 ? 255 : 0;
			}
		}
		offscreenCtx.putImageData(imageData, 0, 0);

		const size = Math.min(canvas.clientWidth || gridSize, canvas.clientHeight || gridSize);
		const dpr = window.devicePixelRatio || 1;
		canvas.width = size * dpr;
		canvas.height = size * dpr;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.fillStyle = "#000000";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.imageSmoothingEnabled = true;
		ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);

		const centerX = canvas.width / 2;
		const centerY = canvas.height / 2;
		const radius = canvas.width * 0.45;

		ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
		ctx.stroke();

		ctx.beginPath();
		ctx.moveTo(centerX - 6, centerY);
		ctx.lineTo(centerX + 6, centerY);
		ctx.moveTo(centerX, centerY - 6);
		ctx.lineTo(centerX, centerY + 6);
		ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
		ctx.stroke();
	}, [vectorscope]);

	return (
		<canvas
			ref={canvasRef}
			className="aspect-square h-full max-h-full w-full max-w-full rounded-md bg-black"
			role="img"
			aria-label="Vectorscope: chroma (Cb/Cr) distribution, center is achromatic"
		/>
	);
}
