"use client";

import { useEffect } from "react";

/**
 * Catches errors thrown by the root layout itself (error.tsx can't catch
 * those -- it's rendered inside the layout it would need to replace).
 * Next.js requires this to render its own <html>/<body>; it can't rely on
 * RootLayout's providers, so this stays deliberately unstyled/minimal.
 */
export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error(error);
	}, [error]);

	return (
		<html lang="en">
			<body
				style={{
					display: "flex",
					minHeight: "100vh",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					gap: "1rem",
					padding: "2rem",
					textAlign: "center",
					fontFamily: "system-ui, sans-serif",
				}}
			>
				<h1 style={{ fontSize: "1.125rem", fontWeight: 500 }}>
					Something went wrong
				</h1>
				<p style={{ color: "#71717a", maxWidth: "28rem", fontSize: "0.875rem" }}>
					{error.message || "An unexpected error occurred."}
				</p>
				<button
					type="button"
					onClick={() => reset()}
					style={{
						padding: "0.5rem 1rem",
						borderRadius: "0.375rem",
						border: "1px solid #e4e4e7",
						cursor: "pointer",
					}}
				>
					Try again
				</button>
			</body>
		</html>
	);
}
