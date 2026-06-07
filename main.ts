import {
	AbstractInputSuggest,
	type App,
	debounce,
	getAllTags,
	type MetadataCache,
	Notice,
	Platform,
	Plugin,
	PluginSettingTab,
	Setting,
	setIcon,
	setTooltip,
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
}

interface ColorRuleGroup {
	folderScope: string;
	scopeMode: "include" | "exclude";
	rules: TagColorConfig[];
}

interface TagsColorFilesSettings {
	colorRuleGroups: ColorRuleGroup[];
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
	colorRuleGroups: [{ folderScope: "", scopeMode: "include", rules: [] }],
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
			activeWindow.setTimeout(() => this.updateFileColors(), 500);
		});
	}

	onunload() {
		if (this.observer) this.observer.disconnect();
		this.removeFileColors();
	}

	async loadSettings() {
		const raw = (await this.loadData()) as Record<string, unknown> | null;
		if (raw?.tagColors && !raw?.colorRuleGroups) {
			// Migrate v1.5: wrap old flat tagColors into a single global group
			this.settings = {
				...DEFAULT_SETTINGS,
				colorStrategy:
					(raw.colorStrategy as TagsColorFilesSettings["colorStrategy"]) ??
					DEFAULT_SETTINGS.colorStrategy,
				dotSize:
					(raw.dotSize as TagsColorFilesSettings["dotSize"]) ??
					DEFAULT_SETTINGS.dotSize,
				colorRuleGroups: [
					{
						folderScope: "",
						scopeMode: "include",
						rules: raw.tagColors as TagColorConfig[],
					},
				],
			};
		} else {
			this.settings = Object.assign(
				{},
				DEFAULT_SETTINGS,
				raw as Partial<TagsColorFilesSettings>,
			);
		}
		// Normalize groups: handle legacy field names (tagRules→rules, folderScopeMode→scopeMode)
		// and fill in any missing required fields with safe defaults
		this.settings.colorRuleGroups = (
			this.settings.colorRuleGroups as unknown as Record<string, unknown>[]
		).map((g) => ({
			folderScope: (g.folderScope as string) ?? "",
			scopeMode:
				((g.scopeMode ?? g.folderScopeMode) as ColorRuleGroup["scopeMode"]) ??
				"include",
			rules: (g.rules ?? g.tagRules ?? []) as TagColorConfig[],
		}));
	}

	async saveSettings() {
		for (const group of this.settings.colorRuleGroups) {
			group.rules = group.rules.filter((r) => r.tag && r.tag.trim() !== "");
		}
		await this.saveData(this.settings);
		this.updateFileColors();
	}

	removeFileColors() {
		const fileExplorers = this.app.workspace.getLeavesOfType("file-explorer");
		fileExplorers.forEach((leaf) => {
			const navFiles =
				leaf.view.containerEl.querySelectorAll<HTMLElement>(".nav-file-title");
			for (const el of navFiles) this.cleanElement(el);
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
		// Pre-normalize rules and folder scopes for all groups once per cycle
		const normalizedGroups = this.settings.colorRuleGroups.map((group) => ({
			folderScope: (group.folderScope ?? "").trim(),
			scopeMode: group.scopeMode ?? "include",
			rules: (group.rules ?? [])
				.filter((c) => c.tag)
				.map((c) => ({
					...c,
					_normalized: c.tag.replace(/^#/, "").toLowerCase(),
				})),
		}));

		fileExplorers.forEach((leaf) => {
			const navFiles =
				leaf.view.containerEl.querySelectorAll<HTMLElement>(
					".nav-file-title",
				);
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
				for (const group of normalizedGroups) {
					// Determine if this group's folder scope applies to the file
					const scope = group.folderScope;
					let applies: boolean;
					if (scope === "") {
						applies = true;
					} else {
						const inScope =
							fileFolder === scope || fileFolder.startsWith(scope + "/");
						applies = group.scopeMode === "include" ? inScope : !inScope;
					}
					if (!applies) continue;
					for (const rule of group.rules) {
						const hasTag = fileTags.some(
							(tag) =>
								tag.replace(/^#/, "").toLowerCase() === rule._normalized,
						);
						if (rule.isNegative ? !hasTag : hasTag) {
							matchedColors.push(rule.color);
						}
					}
				}
				if (matchedColors.length > 0) {
					el.classList.add("colored-tag-file");
					el.classList.add(`strategy-${this.settings.colorStrategy}`);
					el.style.setProperty("--tag-file-color", matchedColors[0]);

					// Check if the current strategy involves dots
					const strategiesWithDots = [
						"before-text",
						"after-text",
						"dots-before-text",
						"dots-after-text",
					];
					if (strategiesWithDots.includes(this.settings.colorStrategy)) {
						const dotsContainer = createDiv();

						// Is element inside a folder
						const hasNavFileParent = !!el.closest("div.nav-folder");
						// Determine if dots are before or after based on the strategy name
						const isBefore =
							this.settings.colorStrategy.includes("before-text");

						// Determine a dot container class according to strategy
						let positionClass: string;
						if (isBefore) {
							positionClass = hasNavFileParent
								? "is-before"
								: "is-before-root";
						} else {
							positionClass = "is-after";
						}

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
	ruleElements: { txt: HTMLInputElement; error: HTMLElement; groupIdx: number }[] =
		[];

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
			const val = el.txt.value.replace(/^#/, "").toLowerCase().trim();
			if (val) tagCounts[val] = (tagCounts[val] || 0) + 1;
		}
		for (const el of groupRuleEls) {
			const rawVal = el.txt.value.trim();
			const normalizedVal = rawVal.replace(/^#/, "").toLowerCase();
			const isDuplicate = normalizedVal && tagCounts[normalizedVal] > 1;
			const isValid = this.validateTagName(rawVal);
			if (isDuplicate || !isValid) {
				el.txt.addClass("is-invalid");
				el.error.addClass("is-visible");
				el.error.setText(
					!isValid ? t("INVALID_TAG_ERROR") : t("DUPLICATE_TAG_ERROR"),
				);
			} else {
				el.txt.removeClass("is-invalid");
				el.error.removeClass("is-visible");
			}
		}
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
					// Added new options
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

		// Check if current strategy is one of the dot strategies to show dot size settings
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

		// Only show EXPORT button if NOT on mobile
		if (!Platform.isMobile) {
			backupSetting.addButton((btn) =>
				btn.setButtonText(t("EXPORT")).onClick(() => {
					const data = JSON.stringify(
						this.plugin.settings.colorRuleGroups,
						null,
						2,
					);
					const blob = new Blob([data], { type: "application/json" });
					const url = URL.createObjectURL(blob);
					const a = document.createElement("a");
					a.href = url;
					a.download = "data.json";
					document.body.appendChild(a);
					a.click();
					document.body.removeChild(a);
					URL.revokeObjectURL(url);
					new Notice(t("EXPORTED"));
				}),
			);
		}

		// Import button — accepts both old flat format and new groups format
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
								if (Array.isArray(parsed)) {
									const isOldFormat = parsed.every(
										(item): item is TagColorConfig =>
											typeof item === "object" &&
											item !== null &&
											"tag" in item &&
											"color" in item &&
											!("rules" in item),
									);
									const isNewFormat = parsed.every(
										(item): item is ColorRuleGroup =>
											typeof item === "object" &&
											item !== null &&
											"rules" in item &&
											Array.isArray(
												(item as ColorRuleGroup).rules,
											),
									);
									if (isOldFormat) {
										this.plugin.settings.colorRuleGroups = [
											{
												folderScope: "",
												scopeMode: "include",
												rules: parsed,
											},
										];
										void this.plugin.saveSettings();
										this.display();
										new Notice(t("IMPORTED"));
									} else if (isNewFormat) {
										this.plugin.settings.colorRuleGroups = parsed;
										void this.plugin.saveSettings();
										this.display();
										new Notice(t("IMPORTED"));
									}
								}
							}
						} catch (_err) {
							new Notice(t("INVALID_FILE"));
						}
					};
					reader.readAsText(file);
				};
				input.click();
			}),
		);

		containerEl.createEl("hr");

		new Setting(containerEl).setName(t("RULES_SECTION")).setHeading();

		new Setting(containerEl)
			.setName(t("ADD_RULE_NAME"))
			.setDesc(t("ADD_RULE_DESC"))
			.addButton((btn) =>
				btn
					.setButtonText(t("ADD_RULE_BTN"))
					.setCta()
					.onClick(() => {
						this.plugin.settings.colorRuleGroups[0].rules.unshift({
							tag: "",
							color: "#4a90e2",
						});
						this.focusPending = 0;
						this.display();
					}),
			)
			.addButton((btn) =>
				btn.setButtonText(t("ADD_FOLDER_SCOPE_BTN")).onClick(() => {
					this.plugin.settings.colorRuleGroups.push({
						folderScope: "",
						scopeMode: "include",
						rules: [],
					});
					void this.plugin.saveSettings();
					this.display();
				}),
			);

		const groupsContainer = containerEl.createDiv({ cls: "tag-groups-list" });

		this.plugin.settings.colorRuleGroups.forEach((group, groupIdx) => {
			const groupDiv = groupsContainer.createDiv({ cls: "tag-scope-group" });

			// ── Group header ──
			const headerDiv = groupDiv.createDiv({ cls: "tag-scope-group-header" });

			// Group reorder arrows (both mobile and desktop)
			const groupReorderDiv = headerDiv.createDiv({
				cls: "tag-reorder-arrows",
			});
			const groupUpBtn = groupReorderDiv.createEl("button", {
				cls: "clickable-icon",
			});
			setIcon(groupUpBtn, "arrow-up");
			groupUpBtn.onclick = () => {
				if (groupIdx > 0) {
					const moved = this.plugin.settings.colorRuleGroups.splice(
						groupIdx,
						1,
					)[0];
					this.plugin.settings.colorRuleGroups.splice(
						groupIdx - 1,
						0,
						moved,
					);
					void this.plugin.saveSettings();
					this.display();
				}
			};
			const groupDownBtn = groupReorderDiv.createEl("button", {
				cls: "clickable-icon",
			});
			setIcon(groupDownBtn, "arrow-down");
			groupDownBtn.onclick = () => {
				if (groupIdx < this.plugin.settings.colorRuleGroups.length - 1) {
					const moved = this.plugin.settings.colorRuleGroups.splice(
						groupIdx,
						1,
					)[0];
					this.plugin.settings.colorRuleGroups.splice(
						groupIdx + 1,
						0,
						moved,
					);
					void this.plugin.saveSettings();
					this.display();
				}
			};

			// Folder path input with autocomplete
			const folderInput = createEl("input");
			folderInput.type = "text";
			folderInput.value = group.folderScope;
			folderInput.placeholder = t("FOLDER_PLACEHOLDER");
			folderInput.addClass("tag-folder-scope-input");
			headerDiv.appendChild(folderInput);
			new FolderSuggest(this.app, folderInput);
			folderInput.oninput = () => {
				group.folderScope = folderInput.value;
				void this.plugin.saveSettings();
			};

			// Scope mode toggle (include / exclude)
			const scopeToggle = headerDiv.createEl("button", {
				cls: "clickable-icon",
			});
			setIcon(
				scopeToggle,
				group.scopeMode === "include" ? "folder-input" : "folder-minus",
			);
			setTooltip(
				scopeToggle,
				group.scopeMode === "include"
					? t("FOLDER_SCOPE_INCLUDE")
					: t("FOLDER_SCOPE_EXCLUDE"),
			);
			scopeToggle.onclick = () => {
				group.scopeMode =
					group.scopeMode === "include" ? "exclude" : "include";
				void this.plugin.saveSettings();
				this.display();
			};

			// Delete group button
			const delGroupBtn = headerDiv.createEl("button", {
				cls: "clickable-icon",
			});
			setIcon(delGroupBtn, "trash");
			setTooltip(delGroupBtn, t("DELETE_GROUP"));
			delGroupBtn.onclick = () => {
				if (this.plugin.settings.colorRuleGroups.length === 1) {
					// Cannot remove the last group — clear its rules instead
					this.plugin.settings.colorRuleGroups[0].rules = [];
					void this.plugin.saveSettings();
					this.display();
				} else {
					this.plugin.settings.colorRuleGroups.splice(groupIdx, 1);
					void this.plugin.saveSettings();
					this.display();
				}
			};

			// ── Rules list ──
			const rulesContainer = groupDiv.createDiv({ cls: "tag-rules-list" });

			if (group.rules.length === 0) {
				rulesContainer.createDiv({
					cls: "tag-group-empty-msg",
					text: t("GROUP_EMPTY"),
				});
			}

			group.rules.forEach((config, ruleIdx) => {
				const div = rulesContainer.createDiv({
					cls: "tag-color-setting-item",
				});

				if (Platform.isMobile) {
					const reorderContainer = div.createDiv({
						cls: "tag-reorder-arrows",
					});
					const upBtn = reorderContainer.createEl("button", {
						cls: "clickable-icon",
					});
					setIcon(upBtn, "arrow-up");
					upBtn.onclick = () => {
						if (ruleIdx > 0) {
							const moved = group.rules.splice(ruleIdx, 1)[0];
							group.rules.splice(ruleIdx - 1, 0, moved);
							void this.plugin.saveSettings();
							this.display();
						}
					};
					const downBtn = reorderContainer.createEl("button", {
						cls: "clickable-icon",
					});
					setIcon(downBtn, "arrow-down");
					downBtn.onclick = () => {
						if (ruleIdx < group.rules.length - 1) {
							const moved = group.rules.splice(ruleIdx, 1)[0];
							group.rules.splice(ruleIdx + 1, 0, moved);
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
					const dragHandle = div.createDiv({
						cls: "clickable-icon drag-handle",
					});
					setIcon(dragHandle, "lucide-grip-vertical");

					div.addEventListener("dragstart", () => {
						this.validateGroupTags(groupIdx);
						if (
							!txt.classList.contains("is-invalid") &&
							txt.value.trim() !== ""
						) {
							config.tag = txt.value;
							void this.plugin.saveSettings();
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
							const moved = group.rules.splice(
								this.draggingRuleIdx,
								1,
							)[0];
							group.rules.splice(ruleIdx, 0, moved);
							this.draggingRuleIdx = ruleIdx;
							void this.plugin.saveSettings();
							this.display();
						}
					});
				}

				// Negative / positive match toggle
				const notBtn = div.createEl("button", {
					cls: "clickable-icon tag-not-btn",
				});
				setIcon(notBtn, config.isNegative ? "ban" : "check");
				setTooltip(
					notBtn,
					config.isNegative
						? t("RULE_MATCH_NEGATIVE")
						: t("RULE_MATCH_POSITIVE"),
				);
				notBtn.onclick = () => {
					config.isNegative = !config.isNegative;
					setIcon(notBtn, config.isNegative ? "ban" : "check");
					setTooltip(
						notBtn,
						config.isNegative
							? t("RULE_MATCH_NEGATIVE")
							: t("RULE_MATCH_POSITIVE"),
					);
					void this.plugin.saveSettings();
				};

				// Color picker
				const cp = createEl("input");
				cp.type = "color";
				cp.value = config.color;
				cp.addClass("tag-color-picker-input");
				cp.onchange = (e: Event) => {
					config.color = (e.target as HTMLInputElement).value;
					void this.plugin.saveSettings();
				};
				div.appendChild(cp);

				// Tag text input
				const inputContainer = div.createDiv({ cls: "tag-input-container" });
				const fieldWrapper = inputContainer.createDiv({
					cls: "tag-input-field-wrapper",
				});

				const txt = createEl("input");
				txt.type = "text";
				txt.value = config.tag;
				txt.placeholder = t("TAG_PLACEHOLDER");
				fieldWrapper.appendChild(txt);

				const errorMsg = inputContainer.createDiv({
					cls: "tag-error-message",
				});
				this.ruleElements.push({ txt, error: errorMsg, groupIdx });
				new TagSuggest(this.app, txt);

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
						group.rules.splice(ruleIdx, 1);
						void this.plugin.saveSettings();
						this.display();
					}
				});

				// Delete rule button
				const del = div.createEl("button", { cls: "clickable-icon" });
				setIcon(del, "trash");
				del.onclick = () => {
					group.rules.splice(ruleIdx, 1);
					void this.plugin.saveSettings();
					this.display();
				};
			});

			// "Add rule to this group" footer
			const addRuleDiv = groupDiv.createDiv({ cls: "tag-group-add-rule" });
			const addRuleBtn = addRuleDiv.createEl("button", {
				cls: "clickable-icon",
			});
			setIcon(addRuleBtn, "plus");
			setTooltip(addRuleBtn, t("ADD_RULE_TO_GROUP"));
			addRuleBtn.onclick = () => {
				group.rules.unshift({ tag: "", color: "#4a90e2" });
				this.focusPending = groupIdx;
				this.display();
			};
		});

		// Focus the first input of the pending group (if a rule was just added)
		if (this.focusPending !== null) {
			const targetGroupIdx = this.focusPending;
			this.focusPending = null;
			const target = this.ruleElements.find(
				(e) => e.groupIdx === targetGroupIdx,
			);
			target?.txt.focus();
		}

		// Run validation for every group
		for (let i = 0; i < this.plugin.settings.colorRuleGroups.length; i++) {
			this.validateGroupTags(i);
		}
	}
}
