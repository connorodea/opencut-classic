import type { Metadata } from "next";
import { BasePage } from "@/app/base-page";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";

const REPO_URL = "https://github.com/connorodea/opencut-classic";
const CONTACT_EMAIL_TODO = "[TODO: add a real support/contact email here]";

export const metadata: Metadata = {
	title: "Privacy Policy - FilmFusion",
	description:
		"How this FilmFusion build handles your data: what stays local, what's sent to our server, and why.",
	openGraph: {
		title: "Privacy Policy - FilmFusion",
		description:
			"How this FilmFusion build handles your data: what stays local, what's sent to our server, and why.",
		type: "website",
	},
};

export default function PrivacyPage() {
	return (
		<BasePage
			title="Privacy policy"
			description="How this build handles your data. This describes the software's actual behavior, not an aspirational summary."
		>
			<Accordion type="single" collapsible className="w-full">
				<AccordionItem
					value="quick-summary"
					className="rounded-2xl border px-5"
				>
					<AccordionTrigger className="no-underline!">
						Quick summary
					</AccordionTrigger>
					<AccordionContent>
						<ol className="list-decimal space-y-2 pl-6">
							<li>
								Your video, audio, and project data stay on your device. Editing
								happens locally in your browser (IndexedDB); we never upload,
								see, or store your footage.
							</li>
							<li>
								This build does not currently offer a sign-in/sign-up screen.
								Its backend does include a working account system (email +
								password) that isn&apos;t connected to any UI today -- see
								&quot;Accounts &amp; Authentication&quot; below for exactly what
								that would store if it were ever exercised.
							</li>
							<li>
								If you submit the in-app feedback form, that message text is
								stored on our server.
							</li>
							<li>
								A couple of server endpoints (feedback, sound-effect search)
								apply IP-based rate limiting to prevent abuse. Your IP address
								is processed transiently for that check, not kept as a stored
								profile.
							</li>
							<li>
								The in-app sound-effects search sends your search text through
								our server to Freesound&apos;s API to fetch results.
							</li>
							<li>
								We use anonymized, aggregate analytics (Databuddy) and
								client-side error reporting to catch bugs -- not individual
								visitor tracking.
							</li>
							<li>
								This is open-source software. You can read the code yourself
								instead of taking this page&apos;s word for it.
							</li>
						</ol>
						<p className="mt-4">Questions? {CONTACT_EMAIL_TODO}</p>
					</AccordionContent>
				</AccordionItem>
			</Accordion>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">How We Handle Your Content</h2>
				<p>
					<strong>
						All video/audio editing and processing happens locally on your
						device.
					</strong>{" "}
					We never upload, store, or have access to your video or audio files or
					the projects you build with them. Project data (timelines, clip
					references, thumbnails) is stored in your browser&apos;s IndexedDB,
					not on our servers.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Accounts & Authentication</h2>
				<p>
					The app does not currently show a sign-in or sign-up screen anywhere
					in its UI, and nothing you do in normal use creates an account.
				</p>
				<p>
					That said, the backend includes a working authentication system (email
					+ password, no third-party sign-in providers) that isn&apos;t wired up
					to any part of the interface today. If it were ever used -- directly,
					or once a UI is built for it -- it would store: your email address, a
					hashed password, and session records (a session token, your IP
					address, and browser user-agent string) in our database. We&apos;re
					disclosing this now, ahead of any UI existing for it, rather than only
					once it ships.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Feedback</h2>
				<p>
					If you use the in-app feedback form, the message text you submit is
					sent to and stored on our server (in our database), along with the
					time it was submitted. We use this to see what&apos;s working and what
					isn&apos;t -- it is not shared with anyone else.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">
					Rate Limiting & Abuse Prevention
				</h2>
				<p>
					The feedback form and the sound-effects search both sit behind
					server-side rate limiting, keyed on your IP address, to stop abuse
					(e.g. spam or scraping). This check is transient -- your IP is used to
					evaluate the rate limit and is not retained as part of a stored
					profile tied to you.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Sound Effects Library</h2>
				<p>
					Searching the in-app sound-effects library sends your search text
					through our server to{" "}
					<a
						href="https://freesound.org"
						target="_blank"
						rel="noopener noreferrer"
						className="text-primary hover:underline"
					>
						Freesound
					</a>
					&apos;s public API to fetch matching results. The request to Freesound
					comes from our server, not your browser directly, so your IP address
					isn&apos;t exposed to Freesound through this feature -- but your
					search terms are sent to them to perform the lookup.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Analytics</h2>
				<p>
					We use{" "}
					<a
						href="https://www.databuddy.cc"
						target="_blank"
						rel="noopener noreferrer"
						className="text-primary hover:underline"
					>
						Databuddy
					</a>{" "}
					for anonymized, aggregate visit analytics and to capture client-side
					errors so we can fix bugs. We do not track individual visitors,
					clicks, or how you use the editor beyond that.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Local Storage & Cookies</h2>
				<p>We use browser local storage and IndexedDB to:</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>Save your projects locally on your device</li>
					<li>Remember your editor preferences and settings</li>
					<li>
						Store app state needed for the editor to work between sessions
					</li>
				</ul>
				<p>
					All of that stays on your device and can be cleared at any time
					through your browser settings. Separately, if the account system
					described above is ever exercised, its underlying library sets a
					session cookie by default -- that doesn&apos;t happen through normal
					use of the app today.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Third-Party Services</h2>
				<p>Services this app talks to, and why:</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>
						<strong>Databuddy:</strong> anonymized analytics and client error
						reporting
					</li>
					<li>
						<strong>Freesound:</strong> powers the in-app sound-effects search
					</li>
					<li>
						<strong>Upstash Redis:</strong> transient IP-based rate limiting on
						a couple of server endpoints
					</li>
					<li>
						<strong>Vercel BotID:</strong> bot-traffic filtering on select
						routes
					</li>
				</ul>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Hosting</h2>
				<p>
					This is open-source software that can be self-hosted (via Docker, with
					your own Postgres and Redis) or deployed to Cloudflare Workers. Where
					any specific running instance of this app is deployed, and who
					operates it, depends on who&apos;s running it -- check with whoever
					gave you the link if that matters for your use case.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Your Rights</h2>
				<p>You have control over your data:</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>No account is required to use the editor itself today</li>
					<li>Clear local storage to remove all saved projects</li>
					<li>
						Contact us (see below) about feedback text you&apos;ve submitted, or
						with any other privacy concern
					</li>
				</ul>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Open Source Transparency</h2>
				<p>
					This is open source. Read the code yourself to see exactly how data is
					handled, and self-host it if you prefer full control.
				</p>
				<p>
					Source code:{" "}
					<a
						href={REPO_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="text-primary hover:underline"
					>
						{REPO_URL}
					</a>
					.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Contact Us</h2>
				<p>Questions about this privacy policy or how we handle your data?</p>
				<p>
					Open an issue on{" "}
					<a
						href={`${REPO_URL}/issues`}
						target="_blank"
						rel="noopener noreferrer"
						className="text-primary hover:underline"
					>
						the repository
					</a>{" "}
					or email {CONTACT_EMAIL_TODO}.
				</p>
			</section>

			<Separator />

			<p className="text-muted-foreground text-sm">
				Last updated: August 10, 2026
			</p>
		</BasePage>
	);
}
