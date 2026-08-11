export type Sponsor = {
	name: string;
	url: string;
	logo: string;
	description: string;
	invertOnDark?: boolean;
};

// Fal.ai/Vercel were the upstream OpenCut project's real sponsors, not
// ours -- don't carry over sponsorship claims that aren't true for this
// fork. Empty until FilmFusion has real sponsors of its own.
export const SPONSORS: Sponsor[] = [];
