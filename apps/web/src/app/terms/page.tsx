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
	title: "Terms of Service - FilmFusion",
	description:
		"Terms of service for this FilmFusion build: free and open source, you own your content.",
	openGraph: {
		title: "Terms of Service - FilmFusion",
		description:
			"Terms of service for this FilmFusion build: free and open source, you own your content.",
		type: "website",
	},
};

export default function TermsPage() {
	return (
		<BasePage
			title="Terms of service"
			description="Fair and transparent terms for this free, open-source video editor. Contact us if you have any questions."
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
						<h3 className="mb-3 text-lg font-medium">
							You own your content, we own nothing.
						</h3>
						<ol className="list-decimal space-y-2 pl-6">
							<li>
								Your video/audio editing happens locally in your browser -- that
								content is never uploaded to our servers
							</li>
							<li>We never claim ownership of your content</li>
							<li>
								Free for personal and commercial use with no watermarks or
								restrictions
							</li>
							<li>
								You&apos;re responsible for how you use it -- don&apos;t break
								the law
							</li>
							<li>
								Service provided &quot;as is&quot; -- we can&apos;t guarantee
								perfect uptime
							</li>
							<li>
								Open source means you can review the code and self-host if
								needed
							</li>
							<li>
								No account is required to use the editor -- your exported videos
								are always yours
							</li>
						</ol>
						<p className="mt-4">Questions? {CONTACT_EMAIL_TODO}</p>
					</AccordionContent>
				</AccordionItem>
			</Accordion>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Your Content, Your Rights</h2>
				<p>
					<strong>You own everything you create.</strong> All video/audio
					editing and processing happens locally on your device. We never see,
					store, or have access to your footage. We make no claims to ownership,
					licensing, or rights over your videos, projects, or any content you
					create with this editor.
				</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>Your video and audio content never leaves your device</li>
					<li>You retain all intellectual property rights to your content</li>
					<li>You can export and use your content however you choose</li>
					<li>No watermarks, no licensing restrictions</li>
				</ul>
				<p>
					One exception: if you submit the in-app feedback form, that message
					text is sent to and stored on our server -- see the Privacy Policy for
					details. That&apos;s the only content flow this doesn&apos;t apply to.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">How You Can Use This</h2>
				<p>This editor is free for personal and commercial use. You can:</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>
						Create videos for personal, educational, or commercial purposes
					</li>
					<li>Use it for client work and paid projects</li>
					<li>Share and distribute videos created with it</li>
					<li>Modify and distribute the software (under its license)</li>
				</ul>
				<p>
					You&apos;re responsible for how you use it and the content you create.
					Don&apos;t use it for anything illegal in your jurisdiction.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Accounts</h2>
				<p>
					No account is required to use the editor, and the app doesn&apos;t
					currently show a sign-in or sign-up screen. See the Privacy
					Policy&apos;s &quot;Accounts &amp; Authentication&quot; section for
					what an account system that exists in the backend -- but isn&apos;t
					yet connected to the UI -- would store if it were ever exercised.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Service</h2>
				<p>
					The service is provided &quot;as is&quot; without warranties. While we
					strive for reliability, we can&apos;t guarantee uninterrupted service.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Open Source Benefits</h2>
				<p>Because this is open source, you have additional rights:</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>Review the code to see exactly how data is handled</li>
					<li>Self-host it on your own servers</li>
					<li>Modify the software to suit your needs</li>
					<li>Contribute improvements back to the community</li>
				</ul>
				<p>
					Source code and license:{" "}
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
				<h2 className="text-2xl font-semibold">Limitations and Liability</h2>
				<p>
					This software is provided free of charge. To the extent permitted by
					law:
				</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>We&apos;re not liable for any loss of data or content</li>
					<li>
						Your video/audio projects are stored in your browser and may be lost
						if you clear browser data
					</li>
					<li>We&apos;re not responsible for how you use the service</li>
					<li>Our liability is limited to the maximum extent allowed by law</li>
				</ul>
				<p>
					Since your video/audio content stays on your device, we have no way to
					recover a lost project. Export important videos when you finish
					editing.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Service Changes</h2>
				<p>We may update this software and these terms:</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>We&apos;ll note significant changes to these terms</li>
					<li>Continued use means you accept any updates</li>
					<li>You can always self-host an older version if you prefer</li>
					<li>Major changes will be discussed with the community on GitHub</li>
				</ul>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Stopping Use</h2>
				<p>You can stop using this editor at any time:</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>Clear your browser data to remove local projects</li>
				</ul>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Contact Us</h2>
				<p>Questions about these terms or need to report an issue?</p>
				<p>
					Contact us through{" "}
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
				<p>
					These terms are governed by applicable law in your jurisdiction. We
					prefer to resolve disputes through friendly discussion in the
					open-source community.
				</p>
			</section>
			<Separator />
			<p className="text-muted-foreground text-sm">
				Last updated: August 10, 2026
			</p>
		</BasePage>
	);
}
