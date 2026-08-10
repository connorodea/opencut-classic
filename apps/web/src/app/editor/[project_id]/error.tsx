"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function EditorError({
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
		<div className="bg-background flex h-screen w-screen flex-col items-center justify-center gap-4 p-8 text-center">
			<h1 className="text-foreground text-lg font-medium">
				The editor hit an error
			</h1>
			<p className="text-muted-foreground max-w-md text-sm">
				{error.message || "An unexpected error occurred."} Your project is
				saved locally -- reopening it should recover your work.
			</p>
			<div className="flex gap-2">
				<Button variant="outline" onClick={() => reset()}>
					Try again
				</Button>
				<Button asChild>
					<a href="/projects">Back to projects</a>
				</Button>
			</div>
		</div>
	);
}
