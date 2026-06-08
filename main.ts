import {
	AbstractInputSuggest,
	type App,
	debounce,
	getAllTags,
	type MetadataCache,
	Menu,
	Notice,
	Platform,
	Plugin,
	PluginSettingTab,
	Setting,
	setIcon,
	TFile,
} from "obsidian";
import { t } from "./locales-list";

// Helper class for tag suggestions
class TagSuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		public inputEl: HTMLInputElement,
	) {
		super(app, inputEl);
	}

	getSuggestions(query: string): string[] {
		const cache = this.app.metadataCache as MetadataCache & {
			getTags(): Record<string, number>;
		};
		const allTags = Object.keys(cache.getTags());
		const normalizedQuery = query.startsWith("#")
			? query.toLowerCase()
			: `#${query.toLowerCase()}`;
		return allTags.filter((tag) => tag.toLowerCase().contains(normalizedQuery));
	}

	renderSuggestion(tag: string, el: HTMLElement): void {
		el.setText(tag);
	}

	selectSuggestion(tag: string): void {
		this.inputEl.value = tag;
		this.inputEl.trigger("input");
		this.close();
	}
}

// Helper class for folder path suggestions
class FolderSuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		public inputEl: HTMLInputElement,
	) {
		super(app, inputEl);
	}

	getSuggestions(query: string): string[] {
		const lowerQuery = query.toLowerCase();
		return this.app.vault
			.getAllFolders(false)
			.map((f) => f.path)
			.filter((p) => p.toLowerCase().contains(lowerQuery));
	}

	renderSuggestion(path: string, el: HTMLElement): void {
		el.setText(path);
	}

	selectSuggestion(path: string): void {
		this.inputEl.value = path;
		this.inputEl.trigger("input");
		this.close();
	}
}

interface TagColorConfig {
	tag: string;
	color: string;
	isNegative?: boolean;
	/** If set, this rule only applies to files inside this folder (and sub-folders) */
	folderScope?: string;
}

interface TagsColorFilesSettings {
	generalRules: TagColorConfig[];
	colorStrategy:
		| "text"
		| "background"
		| "before-text"
		| "after-text"
		| "dots-before-text"
		| "dots-after-text";
	dotSize: "small" | "default" | "big";
}

const DEFAULT_SETTINGS: TagsColorFilesSettings = {
	generalRules: [],
	colorStrategy: "text",
	dotSize: "default",
};

export default class TagsColorFilesPlugin extends Plugin {
	settings!: TagsColorFilesSettings;
	observer!: MutationObserver;
	updateFileColors = debounce(() => this._updateFileColors(), 50, true);

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new TagsColorFilesSettingTab(this.app, this));

		this.registerEvent(
			this.app.metadataCache.on("changed", () => this.updateFileColors()),
		);
		this.registerEvent(
			this.app.vault.on("rename", () => this.updateFileColors()),
		);
		this.registerEvent(
			this.app.workspace.on("layout-change", () => this.updateFileColors()),
		);

		this.observer = new MutationObserver((mutations) => {
			let shouldUpdate = false;
			for (const m of mutations) {
				for (const node of Array.from(m.addedNodes)) {
					if (
						node.nodeType === Node.ELEMENT_NODE &&
						((node as HTMLElement).classList.contains("nav-file") ||
							(node as HTMLElement).querySelector(".nav-file-title"))
					) {
						shouldUpdate = true;
						break;
					}
				}
				if (shouldUpdate) break;
			}
			if (shouldUpdate) this.updateFileColors();
		});

		this.app.workspace.onLayoutReady(() => {
			this.observer.observe(activeDocument.body, {
				childList: true,
				subtree: true,
			});
			window.setTimeout(() => this.updateFileColors(), 500);
		});
	}

	onunload() {
		if (this.observer) this.observer.disconnect();
		this.removeFileColors();
	}

	async loadSettings() {
		const raw = (await this.loadData()) as Record<string, unknown> | null;
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			raw as Partial<TagsColorFilesSettings>,
		);
	}

	async saveSettings() {
		this.settings.generalRules = this.settings.generalRules.filter(
			(r) => r.tag && r.tag.trim() !== "",
		);
		await this.saveData(this.settings);
		this.updateFileColors();
	}

	removeFileColors() {
		const fileExplorers = this.app.workspace.getLeavesOfType("file-explorer");
		fileExplorers.forEach((leaf) => {
			leaf.view.containerEl
				.querySelectorAll<HTMLElement>(".nav-file-title")
				.forEach((el) => this.cleanElement(el));
		});
	}

	private cleanElement(el: HTMLElement) {
		// Added new strategy classes to remove list
		el.classList.remove(
			"colored-tag-file",
			"strategy-text",
			"strategy-background",
			"strategy-before-text",
			"strategy-after-text",
			"strategy-dots-before-text",
			"strategy-dots-after-text",
		);
		el.style.removeProperty("--tag-file-color");
		const existingDots = el.querySelector(".tag-dots-container");
		if (existingDots) existingDots.remove();
	}

	private _updateFileColors() {
		const fileExplorers = this.app.workspace.getLeavesOfType("file-explorer");

		// Pre-normalize rules once per cycle
		const normalizedRules = this.settings.generalRules
			.filter((c) => c.tag)
			.map((c) => ({
				...c,
				_normalized: c.tag.replace(/^#/, "").toLowerCase(),
				_folderScope: (c.folderScope ?? "").trim(),
			}));

		fileExplorers.forEach((leaf) => {
			const navFiles =
				leaf.view.containerEl.querySelectorAll<HTMLElement>(".nav-file-title");
			navFiles.forEach((el) => {
				const path = el.getAttribute("data-path");
				if (!path) return;
				const file = this.app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile) || file.extension !== "md") return;
				const cache = this.app.metadataCache.getFileCache(file);
				const fileTags = cache ? (getAllTags(cache) ?? []) : [];
				this.cleanElement(el);
				const fileFolder = file.parent?.path ?? "";
				const matchedColors: string[] = [];

				for (const rule of normalizedRules) {
					// Per-rule folder scope check (empty = applies everywhere)
					if (rule._folderScope) {
						const inScope =
							fileFolder === rule._folderScope ||
							fileFolder.startsWith(rule._folderScope + "/");
						if (!inScope) continue;
					}
					const hasTag = fileTags.some(
						(tag) =>
							tag.replace(/^#/, "").toLowerCase() === rule._normalized,
					);
					if (rule.isNegative ? !hasTag : hasTag) {
						matchedColors.push(rule.color);
					}
				}

				if (matchedColors.length > 0) {
					el.classList.add("colored-tag-file");
					el.classList.add(`strategy-${this.settings.colorStrategy}`);
					el.style.setProperty("--tag-file-color", matchedColors[0]);

					const strategiesWithDots = [
						"before-text",
						"after-text",
						"dots-before-text",
						"dots-after-text",
					];
					if (strategiesWithDots.includes(this.settings.colorStrategy)) {
						const dotsContainer = createDiv();
						const hasNavFileParent = !!el.closest("div.nav-folder");
						const isBefore =
							this.settings.colorStrategy.includes("before-text");
						const positionClass = isBefore
							? hasNavFileParent
								? "is-before"
								: "is-before-root"
							: "is-after";
						dotsContainer.className = `tag-dots-container ${positionClass} dots-${this.settings.dotSize}`;
						matchedColors.slice(0, 3).forEach((color, i) => {
							const dot = createDiv();
							dot.className = "tag-dot";
							dot.style.setProperty("--dot-color", color);
							dot.style.setProperty("--dot-index", i.toString());
							dotsContainer.appendChild(dot);
						});
						el.appendChild(dotsContainer);
					}
				}
			});
		});
	}
}

class TagsColorFilesSettingTab extends PluginSettingTab {
	plugin: TagsColorFilesPlugin;
	draggingGroupIdx: number | null = null;
	draggingRuleIdx: number | null = null;
	focusPending: number | null = null;
	ruleElements: { txt: HTMLInputElement; folderInput: HTMLInputElement | null; groupIdx: number }[] = [];
	errorBanner: HTMLElement | null = null;


	constructor(app: App, plugin: TagsColorFilesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private validateTagName(tag: string): boolean {
		if (!tag) return true;
		const cleanTag = tag.replace(/^#/, "");
		if (!cleanTag) return true;
		const validTagRegex = /^(?!\d+$)[\p{L}\p{N}/_-]+$/u;
		return validTagRegex.test(cleanTag);
	}

	private validateGroupTags(groupIdx: number) {
		const groupRuleEls = this.ruleElements.filter(
			(e) => e.groupIdx === groupIdx,
		);
		const tagCounts: { [key: string]: number } = {};
		for (const el of groupRuleEls) {
			const tag = el.txt.value.replace(/^#/, "").toLowerCase().trim();
			const scope = (el.folderInput?.value ?? "").trim().toLowerCase();
			if (tag) tagCounts[`${tag}::${scope}`] = (tagCounts[`${tag}::${scope}`] || 0) + 1;
		}
		let firstError: string | null = null;
		for (const el of groupRuleEls) {
			const rawVal = el.txt.value.trim();
			const normalizedVal = rawVal.replace(/^#/, "").toLowerCase();
			const scope = (el.folderInput?.value ?? "").trim().toLowerCase();
			const isDuplicate = normalizedVal && tagCounts[`${normalizedVal}::${scope}`] > 1;
			const isValid = this.validateTagName(rawVal);
			if (isDuplicate || !isValid) {
				el.txt.addClass("is-invalid");
				firstError ??= !isValid ? t("INVALID_TAG_ERROR") : t("DUPLICATE_TAG_ERROR");
			} else {
				el.txt.removeClass("is-invalid");
			}
		}
		if (this.errorBanner) {
			if (firstError !== null) {
				this.errorBanner.setText(firstError);
				this.errorBanner.addClass("is-visible");
			} else {
				this.errorBanner.removeClass("is-visible");
			}
		}
	}

	/**
	 * Render a single rule row (+ its collapsible filter panel) into `container`.
	 * groupIdx is always -1 (single general-rules section).
	 */
	private renderRuleRow(
		container: HTMLDivElement,
		config: TagColorConfig,
		ruleIdx: number,
		groupIdx: number,
		rulesArray: TagColorConfig[],
	) {
		const div = container.createDiv({ cls: "tag-color-setting-item" });

		// Declare txt early so drag-handler closures can reference it
		const txt = createEl("input");
		txt.type = "text";
		txt.value = config.tag;
		txt.placeholder = t("TAG_PLACEHOLDER");

		if (Platform.isMobile) {
			const reorderContainer = div.createDiv({ cls: "tag-reorder-arrows" });
			const upBtn = reorderContainer.createEl("button", {
				cls: "clickable-icon",
			});
			setIcon(upBtn, "arrow-up");
			upBtn.onclick = () => {
				if (ruleIdx > 0) {
					const moved = rulesArray.splice(ruleIdx, 1)[0];
					rulesArray.splice(ruleIdx - 1, 0, moved);
					void this.plugin.saveSettings();
					this.display();
				}
			};
			const downBtn = reorderContainer.createEl("button", {
				cls: "clickable-icon",
			});
			setIcon(downBtn, "arrow-down");
			downBtn.onclick = () => {
				if (ruleIdx < rulesArray.length - 1) {
					const moved = rulesArray.splice(ruleIdx, 1)[0];
					rulesArray.splice(ruleIdx + 1, 0, moved);
					void this.plugin.saveSettings();
					this.display();
				}
			};
		} else {
			if (
				this.draggingGroupIdx === groupIdx &&
				this.draggingRuleIdx === ruleIdx
			) {
				div.addClass("is-dragging");
			}
			div.draggable = true;
			const dragHandle = div.createDiv({ cls: "clickable-icon drag-handle" });
			setIcon(dragHandle, "lucide-grip-vertical");

			div.addEventListener("dragstart", () => {
				this.validateGroupTags(groupIdx);
				// Update config in-memory only — do NOT call saveSettings() here.
				// saveSettings() replaces generalRules with a new filtered array, which
				// detaches the `rulesArray` closure reference and breaks dragover.
				if (!txt.classList.contains("is-invalid") && txt.value.trim() !== "") {
					config.tag = txt.value;
				}
				this.draggingGroupIdx = groupIdx;
				this.draggingRuleIdx = ruleIdx;
				div.addClass("is-dragging");
			});

			div.addEventListener("dragend", () => {
				this.draggingGroupIdx = null;
				this.draggingRuleIdx = null;
				div.removeClass("is-dragging");
				this.display();
			});

			div.addEventListener("dragover", (e) => {
				e.preventDefault();
				if (
					this.draggingGroupIdx === groupIdx &&
					this.draggingRuleIdx !== null &&
					this.draggingRuleIdx !== ruleIdx
				) {
					const moved = rulesArray.splice(this.draggingRuleIdx, 1)[0];
					rulesArray.splice(ruleIdx, 0, moved);
					this.draggingRuleIdx = ruleIdx;
					void this.plugin.saveSettings();
					this.display();
				}
			});
		}

		// ── Color picker (first in row) ───────────────────────────────────────
		const cp = createEl("input");
		cp.type = "color";
		cp.value = config.color;
		cp.addClass("tag-color-picker-input");
		cp.onchange = (e: Event) => {
			config.color = (e.target as HTMLInputElement).value;
			void this.plugin.saveSettings();
		};
		div.appendChild(cp);

		// ── Operator button (contains / doesn't contain) ──────────────────────
		// Matches Obsidian's native "combobox-button filter-operator" element 1:1
		const operatorBtn = div.createDiv({
			cls: "combobox-button filter-operator",
			attr: { tabindex: "0" },
		});
		operatorBtn.createDiv({ cls: "combobox-button-icon" });
		const operatorLabel = operatorBtn.createDiv({ cls: "combobox-button-label" });
		operatorLabel.setText(
			config.isNegative ? t("OPERATOR_NOT_CONTAINS") : t("OPERATOR_CONTAINS"),
		);
		const operatorClearEl = operatorBtn.createDiv({ cls: "combobox-clear-button" });
		setIcon(operatorClearEl, "lucide-x");
		const operatorChevronEl = operatorBtn.createDiv({ cls: "combobox-button-chevron" });
		setIcon(operatorChevronEl, "lucide-chevrons-up-down");
		operatorBtn.addEventListener("click", (e: MouseEvent) => {
			const menu = new Menu();
			menu.addItem((item) =>
				item
					.setTitle(t("OPERATOR_CONTAINS"))
					.setChecked(!config.isNegative)
					.onClick(() => {
						config.isNegative = false;
						operatorLabel.setText(t("OPERATOR_CONTAINS"));
						void this.plugin.saveSettings();
					}),
			);
			menu.addItem((item) =>
				item
					.setTitle(t("OPERATOR_NOT_CONTAINS"))
					.setChecked(!!config.isNegative)
					.onClick(() => {
						config.isNegative = true;
						operatorLabel.setText(t("OPERATOR_NOT_CONTAINS"));
						void this.plugin.saveSettings();
					}),
			);
			const rect = operatorBtn.getBoundingClientRect();
			menu.showAtPosition({ x: rect.left, y: rect.bottom });
		});

		// ── Tag text input ─────────────────────────────────────────────────────
		const inputContainer = div.createDiv({ cls: "tag-input-container" });
		const fieldWrapper = inputContainer.createDiv({
			cls: "tag-input-field-wrapper",
		});
		fieldWrapper.appendChild(txt);
		new TagSuggest(this.app, txt);

		// ── Folder input (folder rules only) ──────────────────────────────────
		// Lives inside inputContainer so it inherits the same flex width as txt.
		let folderInput: HTMLInputElement | null = null;
		if (config.folderScope !== undefined) {
			folderInput = inputContainer.createEl("input");
			const fi = folderInput;
			fi.type = "text";
			fi.value = config.folderScope ?? "";
			fi.placeholder = t("FILTER_FOLDER_PLACEHOLDER");
			fi.addClass("tag-folder-scope-input");
			new FolderSuggest(this.app, fi);

			const debouncedFolderSave = debounce(
				async () => {
					config.folderScope = fi.value.trim();
					await this.plugin.saveSettings();
				},
				400,
				true,
			);
			fi.oninput = () => {
				this.validateGroupTags(groupIdx);
				debouncedFolderSave();
			};
			fi.onchange = (e: Event) => {
				config.folderScope = (e.target as HTMLInputElement).value.trim();
				this.validateGroupTags(groupIdx);
				void this.plugin.saveSettings();
			};
		}

		const debouncedSave = debounce(
			async () => {
				if (txt.value.trim() !== "") {
					config.tag = txt.value;
					await this.plugin.saveSettings();
				}
			},
			400,
			true,
		);

		txt.oninput = () => {
			this.validateGroupTags(groupIdx);
			debouncedSave();
		};

		txt.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				this.validateGroupTags(groupIdx);
				if (!txt.classList.contains("is-invalid")) {
					config.tag = txt.value;
					void this.plugin.saveSettings();
					txt.blur();
				}
			}
		});

		txt.onchange = (e: Event) => {
			config.tag = (e.target as HTMLInputElement).value;
			this.validateGroupTags(groupIdx);
			void this.plugin.saveSettings();
		};

		txt.addEventListener("blur", () => {
			if (!txt.value || txt.value.trim() === "") {
				rulesArray.splice(ruleIdx, 1);
				void this.plugin.saveSettings();
				this.display();
			}
		});

		// ── Delete rule button ─────────────────────────────────────────────────
		const del = div.createEl("button", { cls: "clickable-icon" });
		setIcon(del, "trash");
		del.onclick = () => {
			rulesArray.splice(ruleIdx, 1);
			void this.plugin.saveSettings();
			this.display();
		};

		this.ruleElements.push({ txt, folderInput, groupIdx });
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.ruleElements = [];

		new Setting(containerEl).setName(t("SETTINGS_TITLE")).setHeading();

		const descContainer = containerEl.createDiv({
			cls: "plugin-description-container",
		});
		descContainer.createEl("p", {
			text: t("PLUGIN_DESCRIPTION"),
			cls: "setting-item-description",
		});

		new Setting(containerEl).setName(t("GENERAL_SECTION")).setHeading();

		new Setting(containerEl)
			.setName(t("COLOR_METHOD_NAME"))
			.setDesc(t("COLOR_METHOD_DESC"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("text", t("COLOR_TEXT"))
					.addOption("background", t("COLOR_BG"))
					.addOption("before-text", t("COLOR_DOTS_BEFORE"))
					.addOption("after-text", t("COLOR_DOTS_AFTER"))
					.addOption("dots-before-text", t("COLOR_DOTS_BEFORE_TEXT"))
					.addOption("dots-after-text", t("COLOR_DOTS_AFTER_TEXT"))
					.setValue(this.plugin.settings.colorStrategy)
					.onChange(async (value: string) => {
						this.plugin.settings.colorStrategy =
							value as TagsColorFilesSettings["colorStrategy"];
						await this.plugin.saveSettings();
						this.display();
					});
			});

		const strategiesWithDots = [
			"before-text",
			"after-text",
			"dots-before-text",
			"dots-after-text",
		];
		if (strategiesWithDots.includes(this.plugin.settings.colorStrategy)) {
			new Setting(containerEl)
				.setName(t("DOT_SIZE_NAME"))
				.setDesc(t("DOT_SIZE_DESC"))
				.addDropdown((dropdown) => {
					dropdown
						.addOption("small", t("DOT_SMALL"))
						.addOption("default", t("DOT_DEFAULT"))
						.addOption("big", t("DOT_BIG"))
						.setValue(this.plugin.settings.dotSize)
						.onChange(async (value: string) => {
							this.plugin.settings.dotSize =
								value as TagsColorFilesSettings["dotSize"];
							await this.plugin.saveSettings();
						});
				});
		}

		// Backup section
		const backupSetting = new Setting(containerEl).setName(t("BACKUP_RESTORE"));

		if (!Platform.isMobile) {
			backupSetting.addButton((btn) =>
				btn.setButtonText(t("EXPORT")).onClick(() => {
					const data = JSON.stringify(
						{ generalRules: this.plugin.settings.generalRules },
						null,
						2,
					);
					const blob = new Blob([data], { type: "application/json" });
					const url = URL.createObjectURL(blob);
					const a = activeDocument.createElement("a");
					a.href = url;
					a.download = "data.json";
					activeDocument.body.appendChild(a);
					a.click();
					activeDocument.body.removeChild(a);
					URL.revokeObjectURL(url);
					new Notice(t("EXPORTED"));
				}),
			);
		}

		backupSetting.addButton((btn) =>
			btn.setButtonText(t("IMPORT")).onClick(() => {
				const input = createEl("input");
				input.type = "file";
				input.accept = ".json";
				input.onchange = (e: Event) => {
					const target = e.target as HTMLInputElement;
					const file = target.files?.[0];
					if (!file) return;
					const reader = new FileReader();
					reader.onload = (event: ProgressEvent<FileReader>) => {
						try {
							const result = event.target?.result;
							if (typeof result === "string") {
								const parsed: unknown = JSON.parse(result);
								if (
									typeof parsed === "object" &&
									parsed !== null &&
									!Array.isArray(parsed) &&
									"generalRules" in parsed
								) {
									const obj = parsed as { generalRules?: TagColorConfig[] };
									this.plugin.settings.generalRules = Array.isArray(obj.generalRules)
										? obj.generalRules
										: [];
									void this.plugin.saveSettings();
									this.display();
									new Notice(t("IMPORTED"));
									return;
								}
								new Notice(t("INVALID_FILE"));
							}
						} catch {
							new Notice(t("INVALID_FILE"));
						}
					};
					reader.readAsText(file);
				};
				input.click();
			}),
		);

		// ════════════════════════════════════
		// Coloring rules section
		// ════════════════════════════════════
		new Setting(containerEl)
			.setName(t("COLORING_RULES_SECTION"))
			.setHeading();

		new Setting(containerEl)
			.setDesc(t("ADD_RULE_DESC"))
			.addButton((btn) =>
				btn
					.setButtonText(t("ADD_FOLDER_RULE_BTN"))
					.onClick(() => {
						this.plugin.settings.generalRules.unshift({
							tag: "",
							color: "#4a90e2",
							folderScope: "",
						});
						this.focusPending = -1;
						this.display();
					}),
			)
			.addButton((btn) =>
				btn
					.setButtonText(t("ADD_RULE_BTN"))
					.setCta()
					.onClick(() => {
						this.plugin.settings.generalRules.unshift({
							tag: "",
							color: "#4a90e2",
						});
						this.focusPending = -1;
						this.display();
					}),
			);

		this.errorBanner = containerEl.createDiv({ cls: "tag-error-message" });

		const generalRulesContainer = containerEl.createDiv({
			cls: "tag-rules-list",
		});

		this.plugin.settings.generalRules.forEach((config, ruleIdx) => {
			this.renderRuleRow(
				generalRulesContainer,
				config,
				ruleIdx,
				-1,
				this.plugin.settings.generalRules,
			);
		});

		// Focus the first input if a rule was just added
		if (this.focusPending !== null) {
			this.focusPending = null;
			const target = this.ruleElements.find((e) => e.groupIdx === -1);
			target?.txt.focus();
		}

		// Validate
		this.validateGroupTags(-1);
	}
}
