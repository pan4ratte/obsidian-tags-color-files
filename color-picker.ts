import { type App, debounce, Platform, Scope, setIcon } from "obsidian";
import { t } from "./locales-list";

// The plugin's own color picker. The browser's `<input type="color">` hands
// off to the system dialog, which looks different on every platform and on
// some of them has no field to paste a hex code into.

/** Hue in degrees (0–360), saturation and value (brightness) from 0 to 1.
 *  Kept as the picker's state instead of the hex code: a gray or black has no
 *  hue of its own, and the hue slider must not jump when one is picked. */
interface Hsv {
	h: number;
	s: number;
	v: number;
}

/** `#rgb` or `#rrggbb`, with or without the `#`, as lowercase `#rrggbb`. */
function parseHex(text: string): string | null {
	const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
	if (!match) return null;
	let hex = match[1].toLowerCase();
	if (hex.length === 3) hex = hex.replace(/./g, "$&$&");
	return `#${hex}`;
}

function hexToHsv(hex: string): Hsv {
	const n = parseInt(hex.slice(1), 16);
	const r = ((n >> 16) & 255) / 255;
	const g = ((n >> 8) & 255) / 255;
	const b = (n & 255) / 255;
	const max = Math.max(r, g, b);
	const delta = max - Math.min(r, g, b);
	let h = 0;
	if (delta) {
		if (max === r) h = ((g - b) / delta) % 6;
		else if (max === g) h = (b - r) / delta + 2;
		else h = (r - g) / delta + 4;
		h = (h * 60 + 360) % 360;
	}
	return { h, s: max ? delta / max : 0, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
	const channel = (n: number) => {
		const k = (n + h / 60) % 6;
		const value = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
		return ("0" + Math.round(value * 255).toString(16)).slice(-2);
	};
	return `#${channel(5)}${channel(3)}${channel(1)}`;
}

const clamp = (x: number) => Math.min(1, Math.max(0, x));

/** What a suggested color is for: text and dots, which must stand out from
 *  the background, or a row background, which the text must stand out from. */
export type ColorTone = "foreground" | "background";

/**
 * Lightness and chroma, in OKLCH, of the suggested colors. OKLCH lightness is
 * perceptual, so every hue at one lightness looks as bright as the next, and
 * the suggestions contrast with the theme equally well whatever hue comes up.
 * The foreground values keep text at about 4.5:1 or better against Obsidian's
 * default background — dark text on the light theme, light text on the dark
 * one. The background values are soft tints that the theme's normal text
 * color stays readable on.
 */
const SUGGESTION_TONES: Record<"light" | "dark", Record<ColorTone, { l: number; c: number }>> = {
	light: {
		foreground: { l: 0.55, c: 0.15 },
		background: { l: 0.9, c: 0.06 },
	},
	dark: {
		foreground: { l: 0.76, c: 0.13 },
		background: { l: 0.38, c: 0.08 },
	},
};

/** The golden angle. Stepping the hue by it never lands near a hue it has
 *  already visited soon, so each click gives a clearly different color. */
const GOLDEN_ANGLE = 137.508;

/** Where the next suggestion's hue comes from. Starts somewhere different in
 *  each session, so the suggestions do not always open on the same color. */
let suggestionHue = Math.random() * 360;

/** OKLCH to `#rrggbb`. Chroma is lowered until the color fits in sRGB, since
 *  not every hue reaches the same chroma at a given lightness. */
function oklchToHex(l: number, c: number, h: number): string {
	const toSrgb = (chroma: number): number[] | null => {
		const a = chroma * Math.cos((h * Math.PI) / 180);
		const b = chroma * Math.sin((h * Math.PI) / 180);
		const lms = [
			l + 0.3963377774 * a + 0.2158037573 * b,
			l - 0.1055613458 * a - 0.0638541728 * b,
			l - 0.0894841775 * a - 1.291485548 * b,
		].map((x) => x * x * x);
		const linear = [
			4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
			-1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
			-0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
		];
		if (linear.some((x) => x < -1e-4 || x > 1 + 1e-4)) return null;
		return linear.map((x) => {
			const v = clamp(x);
			return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
		});
	};
	let chroma = c;
	let rgb = toSrgb(chroma);
	while (!rgb) {
		chroma = Math.max(0, chroma - 0.005);
		rgb = toSrgb(chroma);
	}
	return `#${rgb.map((x) => ("0" + Math.round(x * 255).toString(16)).slice(-2)).join("")}`;
}

/** A pleasant color for the current theme, a golden-angle step of hue away
 *  from the previous suggestion. */
function suggestColor(doc: Document, tone: ColorTone): string {
	suggestionHue = (suggestionHue + GOLDEN_ANGLE) % 360;
	const theme = doc.body.hasClass("theme-dark") ? "dark" : "light";
	const { l, c } = SUGGESTION_TONES[theme][tone];
	return oklchToHex(l, c, suggestionHue);
}

/** Only one picker is open at a time; opening another closes this one. */
let openPicker: ColorPopover | null = null;

/** Closes the open picker, if any, saving what was picked in it. Called
 *  whenever the rows it belongs to are about to be rebuilt or hidden. */
export function closeColorPicker() {
	openPicker?.close();
}

export interface ColorSwatchOptions {
	app: App;
	value: string;
	/** Called with a `#rrggbb` code once the pointer rests, and on close. */
	onChange(value: string): void;
	/** What the suggest button should aim for. Asked on each click, since the
	 *  coloring method can change while the settings are open. */
	tone(): ColorTone;
}

/** A round swatch that opens the picker when clicked. */
export function createColorSwatch(
	parent: HTMLElement,
	{ app, value, onChange, tone }: ColorSwatchOptions,
): HTMLElement {
	// Rules imported from a file may carry anything as their color.
	let color = parseHex(value) ?? "#000000";
	const swatch = parent.createDiv({
		cls: "tag-color-swatch",
		attr: { role: "button", tabindex: "0", "aria-label": t("COLOR_PICKER_LABEL") },
	});
	swatch.style.setProperty("--swatch-color", color);

	// Dragging across the picker produces a color on every pointer move; saving
	// each one would rewrite the settings file and recolor the vault each time.
	const save = debounce(() => onChange(color), 300, true);

	const toggle = () => {
		if (openPicker?.anchor === swatch) {
			openPicker.close();
			return;
		}
		closeColorPicker();
		openPicker = new ColorPopover(app, swatch, color, tone, (picked) => {
			color = picked;
			swatch.style.setProperty("--swatch-color", color);
			save();
		}, () => save.run());
	};
	swatch.addEventListener("click", toggle);
	swatch.addEventListener("keydown", (e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			toggle();
		}
	});
	return swatch;
}

class ColorPopover {
	private readonly el: HTMLElement;
	private readonly areaEl: HTMLElement;
	private readonly hueEl: HTMLElement;
	private readonly hexInput: HTMLInputElement;
	private readonly scope: Scope;
	private hsv: Hsv;
	private hex: string;

	/** A press anywhere but the picker or its swatch closes it. The swatch is
	 *  left to its own click, which closes the picker as a toggle. */
	private readonly onOutsidePointer = (e: PointerEvent) => {
		const target = e.target as Node;
		if (!this.el.contains(target) && !this.anchor.contains(target)) {
			this.close();
		}
	};
	/** Scrolling the settings, resizing the window or an on-screen keyboard
	 *  opening moves the swatch or the visible area; keep the picker beside the
	 *  swatch and in view. */
	private readonly onViewportChange = () => this.position();

	constructor(
		private readonly app: App,
		readonly anchor: HTMLElement,
		value: string,
		tone: () => ColorTone,
		private readonly onPick: (hex: string) => void,
		private readonly onClose: () => void,
	) {
		this.hex = value;
		this.hsv = hexToHsv(value);

		// Lives in the body, not in the settings: the settings pane scrolls and
		// clips whatever overflows it.
		const doc = anchor.doc;
		this.el = doc.body.createDiv({ cls: "tag-color-popover" });

		this.areaEl = this.el.createDiv({
			cls: "tag-color-picker-area",
			attr: { tabindex: "0" },
		});
		this.areaEl.createDiv({ cls: "tag-color-picker-area-thumb" });
		this.track(this.areaEl, (x, y) =>
			this.setHsv({ h: this.hsv.h, s: x, v: 1 - y }),
		);
		this.areaEl.addEventListener("keydown", (e) => {
			const step = e.shiftKey ? 0.1 : 0.01;
			const { h, s, v } = this.hsv;
			const moves: Record<string, Hsv> = {
				ArrowLeft: { h, s: clamp(s - step), v },
				ArrowRight: { h, s: clamp(s + step), v },
				ArrowUp: { h, s, v: clamp(v + step) },
				ArrowDown: { h, s, v: clamp(v - step) },
			};
			if (!moves[e.key]) return;
			e.preventDefault();
			this.setHsv(moves[e.key]);
		});

		this.hueEl = this.el.createDiv({
			cls: "tag-color-picker-hue",
			attr: { tabindex: "0" },
		});
		this.hueEl.createDiv({ cls: "tag-color-picker-hue-thumb" });
		this.track(this.hueEl, (x) =>
			this.setHsv({ ...this.hsv, h: x * 360 }),
		);
		this.hueEl.addEventListener("keydown", (e) => {
			const step = e.shiftKey ? 10 : 1;
			const delta =
				e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
			if (!delta) return;
			e.preventDefault();
			this.setHsv({ ...this.hsv, h: Math.min(360, Math.max(0, this.hsv.h + delta)) });
		});

		const hexRow = this.el.createDiv({ cls: "tag-color-picker-hex-row" });
		this.hexInput = hexRow.createEl("input", {
			cls: "tag-color-picker-hex",
			type: "text",
			attr: {
				maxlength: "7",
				placeholder: "#rrggbb",
				// Keep phone keyboards from capitalizing, autocorrecting or
				// suggesting words into a hex code; Enter reads "Done".
				spellcheck: "false",
				autocomplete: "off",
				autocapitalize: "off",
				autocorrect: "off",
				enterkeyhint: "done",
			},
		});
		this.hexInput.addEventListener("input", () => {
			const hex = parseHex(this.hexInput.value);
			this.hexInput.toggleClass("is-invalid", !hex);
			if (hex) this.setHex(hex);
		});
		// Whatever was left half-typed goes back to the color actually picked.
		this.hexInput.addEventListener("blur", () => this.render());
		this.hexInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !this.hexInput.hasClass("is-invalid")) {
				e.preventDefault();
				this.close();
			}
		});

		const suggestButton = hexRow.createEl("button", {
			cls: "clickable-icon",
			attr: { "aria-label": t("COLOR_PICKER_SUGGEST") },
		});
		setIcon(suggestButton, "lucide-dices");
		suggestButton.addEventListener("click", () => {
			const hex = suggestColor(anchor.doc, tone());
			this.hex = hex;
			this.hsv = hexToHsv(hex);
			this.render();
			this.onPick(hex);
		});

		this.render();
		this.position();

		// Escape closes the picker rather than the settings window around it.
		this.scope = new Scope(app.scope);
		this.scope.register([], "Escape", () => {
			this.close();
			return false;
		});
		app.keymap.pushScope(this.scope);
		doc.addEventListener("pointerdown", this.onOutsidePointer, true);
		// Scroll events do not bubble; capture catches the settings pane's.
		doc.addEventListener("scroll", this.onViewportChange, true);
		anchor.win.addEventListener("resize", this.onViewportChange);
		anchor.win.visualViewport?.addEventListener("resize", this.onViewportChange);
		anchor.win.visualViewport?.addEventListener("scroll", this.onViewportChange);

		// Ready for a pasted code straight away. Not on phones and tablets,
		// where focusing the field would pop the on-screen keyboard up.
		if (!Platform.isMobile) {
			this.hexInput.focus();
			this.hexInput.select();
		}
	}

	close() {
		if (openPicker !== this) return;
		openPicker = null;
		this.app.keymap.popScope(this.scope);
		const doc = this.anchor.doc;
		doc.removeEventListener("pointerdown", this.onOutsidePointer, true);
		doc.removeEventListener("scroll", this.onViewportChange, true);
		this.anchor.win.removeEventListener("resize", this.onViewportChange);
		this.anchor.win.visualViewport?.removeEventListener("resize", this.onViewportChange);
		this.anchor.win.visualViewport?.removeEventListener("scroll", this.onViewportChange);
		this.el.remove();
		this.onClose();
	}

	/** Calls `update` with the pointer's position inside `el`, from 0 to 1 on
	 *  each axis, from the press until the release — even outside `el`. */
	private track(el: HTMLElement, update: (x: number, y: number) => void) {
		const move = (e: PointerEvent) => {
			const rect = el.getBoundingClientRect();
			update(
				clamp((e.clientX - rect.left) / rect.width),
				clamp((e.clientY - rect.top) / rect.height),
			);
		};
		el.addEventListener("pointerdown", (e) => {
			if (e.button !== 0) return;
			e.preventDefault();
			el.focus();
			el.setPointerCapture(e.pointerId);
			move(e);
			el.addEventListener("pointermove", move);
			el.addEventListener(
				"lostpointercapture",
				() => el.removeEventListener("pointermove", move),
				{ once: true },
			);
		});
	}

	private setHsv(hsv: Hsv) {
		this.hsv = hsv;
		this.hex = hsvToHex(hsv);
		this.render();
		this.onPick(this.hex);
	}

	/** From the hex field: the code is kept exactly as typed, and the field is
	 *  left alone so the cursor does not jump. */
	private setHex(hex: string) {
		this.hex = hex;
		this.hsv = hexToHsv(hex);
		this.render(false);
		this.onPick(hex);
	}

	private render(updateField = true) {
		const { h, s, v } = this.hsv;
		this.el.setCssProps({
			"--picker-h": String(h),
			"--picker-s": String(s),
			"--picker-v": String(v),
			"--picker-color": this.hex,
		});
		if (updateField) {
			this.hexInput.value = this.hex;
			this.hexInput.removeClass("is-invalid");
		}
	}

	/**
	 * Below the swatch, or above it when there is no room below, and always
	 * inside the part of the window that can be seen. That is the visual
	 * viewport: on iOS the on-screen keyboard covers the page without making
	 * the window any smaller.
	 */
	private position() {
		const win = this.anchor.win;
		const view = win.visualViewport;
		const viewTop = view?.offsetTop ?? 0;
		const viewLeft = view?.offsetLeft ?? 0;
		const viewBottom = viewTop + (view?.height ?? win.innerHeight);
		const viewRight = viewLeft + (view?.width ?? win.innerWidth);
		const margin = 8;
		const gap = 6;
		const anchor = this.anchor.getBoundingClientRect();
		const { offsetWidth: width, offsetHeight: height } = this.el;
		let top = anchor.bottom + gap;
		if (top + height > viewBottom - margin && anchor.top - gap - height >= viewTop + margin) {
			top = anchor.top - gap - height;
		}
		// Neither side has room on a phone held sideways with the keyboard up:
		// keep the whole picker, and the field being typed in, on screen, even
		// if that covers the swatch.
		top = Math.max(viewTop + margin, Math.min(top, viewBottom - height - margin));
		const left = Math.max(
			viewLeft + margin,
			Math.min(anchor.left, viewRight - width - margin),
		);
		this.el.setCssStyles({ top: `${top}px`, left: `${left}px` });
	}
}
