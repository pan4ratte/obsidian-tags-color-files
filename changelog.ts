import { type App, Component, MarkdownRenderer, Modal, moment, setIcon, setTooltip } from "obsidian";
import { t } from "./locales-list";
// Imported as text (esbuild's ".md" loader, see markdown.d.ts) and shipped inside
// main.js, so the plugin can show the notes for the release it is running.
import changelogEn from "./CHANGELOG.md";
import changelogRu from "./CHANGELOG_RU.md";

// Translated changelogs by interface language; any other falls back to English.
const CHANGELOGS: Record<string, string> = {
	ru: changelogRu,
};

/** The changelog in the interface language. `moment.locale()` gives tags such
 *  as "ru" or "zh-cn", so a regional tag also tries its base language. */
function changelogContent(): string {
	const lang = moment.locale();
	return CHANGELOGS[lang] ?? CHANGELOGS[lang.split("-")[0]] ?? changelogEn;
}

// Borrowed from the sibling Advanced Word Count plugin (itself from Citation
// Suite): the changelog window, and the notice at the head of the settings that
// announces what the running release brought.

/**
 * The changelog, rendered as the markdown it is written in.
 *
 * `MarkdownRenderer.render` wants a component to hang the renderer's own children
 * off, and the modal is not one: a `Component` of its own is loaded for the life
 * of the modal and unloaded with it, or the links it registers outlive the window.
 */
export class ChangelogModal extends Modal {
	private readonly renderComponent = new Component();

	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		// Deliberately not Obsidian's `markdown-rendered` beside it: that one sizes
		// markdown for reading a note and would override every size in styles.css.
		contentEl.addClass("tag-markdown-modal");
		this.renderComponent.load();
		// No source path: nothing in the changelog resolves against a vault note.
		void MarkdownRenderer.render(this.app, changelogContent(), contentEl, "", this.renderComponent);
	}

	onClose() {
		this.renderComponent.unload();
		this.contentEl.empty();
	}
}

export interface ChangelogNoticeOptions {
	app: App;
	/** The release running now, which is also what dismissing remembers. */
	version: string;
	/** The release whose "what's new" notice was dismissed. */
	dismissedVersion: string;
	onDismiss(): void;
}

/**
 * What this release brought, as a card at the head of the settings, until it is
 * dismissed. Dismissing closes the space up behind the card rather than blinking
 * it out of a gap.
 */
export function renderChangelogNotice(parent: HTMLElement, options: ChangelogNoticeOptions): void {
	if (options.dismissedVersion === options.version) return;

	const card = parent.createDiv({ cls: "tag-changelog-notice" });
	// The icon and the text travel together, so they can be centered as one.
	const message = card.createDiv({ cls: "tag-changelog-message" });
	setIcon(message.createSpan({ cls: "tag-changelog-icon" }), "sparkles");
	message.createSpan({
		cls: "tag-changelog-notice-text",
		text: t("CHANGELOG_UPDATED").replace("{version}", options.version),
	});
	// A labelled button, so what opens the changelog says so — the version itself
	// is plain text.
	// The buttons share a wrapper so that, on a narrow pane, they drop together onto
	// a line of their own under the text rather than squeezing it.
	const actions = card.createDiv({ cls: "tag-changelog-actions" });
	const openBtn = actions.createEl("button", {
		cls: "tag-changelog-open",
		text: t("CHANGELOG_SEE_WHATS_NEW"),
	});
	openBtn.addEventListener("click", () => new ChangelogModal(options.app).open());

	const dismiss = actions.createEl("button", {
		cls: "tag-changelog-dismiss",
		text: t("CHANGELOG_DISMISS"),
	});
	setTooltip(dismiss, t("CHANGELOG_DISMISS_TOOLTIP"));

	// Once the buttons have wrapped onto a line of their own, the message is
	// centered above them. Where they wrap depends on how long the translated
	// labels are, so it is measured, not guessed from a width. Centering changes
	// only the alignment inside the message, never its width, so it cannot make
	// the buttons fit back beside it and set the two flipping.
	const stacking = new ResizeObserver(() => {
		card.toggleClass(
			"is-stacked",
			actions.offsetTop >= message.offsetTop + message.offsetHeight,
		);
	});
	stacking.observe(card);

	dismiss.addEventListener("click", () => {
		stacking.disconnect();
		options.onDismiss();
		if (card.win.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			card.remove();
			return;
		}
		const style = card.win.getComputedStyle(card);
		const animation = card.animate(
			{
				height: [`${card.getBoundingClientRect().height}px`, "0px"],
				marginBottom: [style.marginBottom, "0px"],
				opacity: [1, 0],
			},
			{ duration: 180, easing: "ease-in-out" },
		);
		animation.onfinish = () => card.remove();
	});
}
