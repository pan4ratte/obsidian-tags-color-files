import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  getAllTags,
  Notice,
  setIcon,
  AbstractInputSuggest,
  MetadataCache,
  Platform,
  debounce,
  setTooltip,
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
      : "#" + query.toLowerCase();
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

class FolderSuggest extends AbstractInputSuggest<string> {
  constructor(
    app: App,
    public inputEl: HTMLInputElement,
  ) {
    super(app, inputEl);
  }

  getSuggestions(query: string): string[] {
    const folders: string[] = [];
    const normalizedQuery = query.toLowerCase();
    this.app.vault.getAllLoadedFiles().forEach((f) => {
      if (f instanceof TFolder && f.path !== "/") {
        if (f.path.toLowerCase().contains(normalizedQuery)) {
          folders.push(f.path);
        }
      }
    });
    return folders.sort();
  }

  renderSuggestion(folder: string, el: HTMLElement): void {
    el.setText(folder);
  }

  selectSuggestion(folder: string): void {
    this.inputEl.value = folder;
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
  folderScope?: string;
  folderScopeMode?: "include" | "exclude";
  tagRules: TagColorConfig[];
}

interface TagsColorFilesSettings {
  colorRuleGroups: ColorRuleGroup[];
  // Added new strategies to the type definition
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
  colorRuleGroups: [],
  colorStrategy: "text",
  dotSize: "default",
};

export default class TagsColorFilesPlugin extends Plugin {
  settings: TagsColorFilesSettings;
  observer: MutationObserver;
  isUpdating = false;
  private scheduleUpdate = debounce(() => this.updateFileColors(), 50, true);

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new TagsColorFilesSettingTab(this.app, this));

    this.registerEvent(
      this.app.metadataCache.on("changed", () => this.scheduleUpdate()),
    );
    this.registerEvent(
      this.app.vault.on("rename", () => this.scheduleUpdate()),
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.scheduleUpdate()),
    );

    this.observer = new MutationObserver((mutations) => {
      if (this.isUpdating) return;
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
      if (shouldUpdate) this.scheduleUpdate();
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
    const loaded = (await this.loadData()) as Record<string, unknown> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);

    // Migration from old flat tagColors format
    if (
      loaded &&
      Array.isArray((loaded as any).tagColors) &&
      !Array.isArray((loaded as any).colorRuleGroups)
    ) {
      const oldRules = (loaded as any).tagColors as any[];
      const tagRules: TagColorConfig[] = oldRules.map((r: any) => ({
        tag: r.tag || "",
        color: r.color || "#4a90e2",
        ...(r.isNegative ? { isNegative: true } : {}),
      }));
      this.settings.colorRuleGroups = [{ tagRules }];
      delete (this.settings as any).tagColors;
      await this.saveData(this.settings);
    }
  }

  async saveSettings() {
    for (const group of this.settings.colorRuleGroups) {
      group.tagRules = group.tagRules.filter(
        (rule) => rule.tag && rule.tag.trim() !== "",
      );
    }
    this.settings.colorRuleGroups = this.settings.colorRuleGroups.filter(
      (g) => g.folderScope !== undefined || g.tagRules.length > 0,
    );
    await this.saveData(this.settings);
    this.updateFileColors();
  }

  removeFileColors() {
    const fileExplorers = this.app.workspace.getLeavesOfType("file-explorer");
    fileExplorers.forEach((leaf) => {
      const navFiles =
        leaf.view.containerEl.querySelectorAll(".nav-file-title");
      navFiles.forEach((el: HTMLElement) => this.cleanElement(el));
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

  updateFileColors() {
    if (this.isUpdating) return;
    window.requestAnimationFrame(() => {
      this.isUpdating = true;

      const preparedGroups = this.settings.colorRuleGroups.map((group) => ({
        scope: group.folderScope?.trim() || "",
        scopeMode: group.folderScopeMode || "include",
        rules: group.tagRules
          .filter((r) => r.tag)
          .map((r) => ({
            normalizedTag: r.tag.replace(/^#/, "").toLowerCase(),
            color: r.color,
            isNegative: !!r.isNegative,
          })),
      }));

      const hasDots = [
        "before-text",
        "after-text",
        "dots-before-text",
        "dots-after-text",
      ].includes(this.settings.colorStrategy);
      const isBefore = this.settings.colorStrategy.includes("before-text");

      const fileExplorers = this.app.workspace.getLeavesOfType("file-explorer");
      fileExplorers.forEach((leaf) => {
        const navFiles =
          leaf.view.containerEl.querySelectorAll(".nav-file-title");
        navFiles.forEach((el: HTMLElement) => {
          const path = el.getAttribute("data-path");
          if (!path) return;

          if (!path.endsWith(".md")) {
            this.cleanElement(el);
            return;
          }

          const file = this.app.vault.getAbstractFileByPath(path);
          if (!(file instanceof TFile)) return;

          const cache = this.app.metadataCache.getFileCache(file);

          const rawTags = cache ? getAllTags(cache) : null;
          const fileTagSet = new Set<string>(
            rawTags
              ? rawTags.map((t) => t.replace(/^#/, "").toLowerCase())
              : [],
          );

          this.cleanElement(el);
          if (preparedGroups.length === 0) return;

          const matchedColors: string[] = [];
          for (const group of preparedGroups) {
            if (group.scope) {
              const inScope = path.startsWith(group.scope + "/");
              if (group.scopeMode === "include" && !inScope) continue;
              if (group.scopeMode === "exclude" && inScope) continue;
            }
            for (const rule of group.rules) {
              const hasTag = fileTagSet.has(rule.normalizedTag);
              if (rule.isNegative ? !hasTag : hasTag) {
                matchedColors.push(rule.color);
              }
            }
          }

          if (matchedColors.length > 0) {
            el.classList.add("colored-tag-file");
            el.classList.add(`strategy-${this.settings.colorStrategy}`);
            el.style.setProperty("--tag-file-color", matchedColors[0]);

            if (hasDots) {
              const dotsContainer = createDiv();
              const hasNavFileParent = !!el.closest("div.nav-folder");
              // Determine a dot container class according to strategy
              let positionClass;
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
      this.isUpdating = false;
    });
  }
}

class TagsColorFilesSettingTab extends PluginSettingTab {
  plugin: TagsColorFilesPlugin;
  draggingGroupIndex: number | null = null;
  draggingRuleInfo: { groupIndex: number; ruleIndex: number } | null = null;
  lastCreatedInput: HTMLInputElement | null = null;
  pendingFocusGroup = -1;
  ruleElements: {
    txt: HTMLInputElement;
    error: HTMLElement;
    groupIndex: number;
  }[] = [];

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

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.ruleElements = [];
    this.lastCreatedInput = null;

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
          .onChange(async (value: TagsColorFilesSettings["colorStrategy"]) => {
            this.plugin.settings.colorStrategy = value;
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
            .onChange(async (value: TagsColorFilesSettings["dotSize"]) => {
              this.plugin.settings.dotSize = value;
              await this.plugin.saveSettings();
            });
        });
    }

    // --- MODIFIED BACKUP SECTION ---
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

    // Import button remains for everyone
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
                  // New format: array of ColorRuleGroup
                  if (
                    parsed.every(
                      (item: any) =>
                        typeof item === "object" &&
                        item !== null &&
                        "tagRules" in item &&
                        Array.isArray(item.tagRules),
                    )
                  ) {
                    this.plugin.settings.colorRuleGroups =
                      parsed as ColorRuleGroup[];
                    void this.plugin.saveSettings();
                    this.display();
                    new Notice(t("IMPORTED"));
                  }
                  // Old format: array of TagColorConfig (backward compatible import)
                  else if (
                    parsed.every(
                      (item: any) =>
                        typeof item === "object" &&
                        item !== null &&
                        "tag" in item &&
                        "color" in item,
                    )
                  ) {
                    const tagRules = parsed as TagColorConfig[];
                    this.plugin.settings.colorRuleGroups = [{ tagRules }];
                    void this.plugin.saveSettings();
                    this.display();
                    new Notice(t("IMPORTED"));
                  } else {
                    new Notice(t("INVALID_FILE"));
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
    // --------------------------------

    containerEl.createEl("hr");

    new Setting(containerEl).setName(t("RULES_SECTION")).setHeading();

    const addBtnSetting = new Setting(containerEl)
      .setName(t("ADD_RULE_NAME"))
      .setDesc(t("ADD_RULE_DESC"));

    addBtnSetting.addButton((btn) =>
      btn
        .setButtonText(t("ADD_RULE_BTN"))
        .setCta()
        .onClick(() => {
          // Find or create a global group to add the rule to
          let globalGroup = this.plugin.settings.colorRuleGroups.find(
            (g) => g.folderScope === undefined,
          );
          if (!globalGroup) {
            globalGroup = { tagRules: [] };
            this.plugin.settings.colorRuleGroups.unshift(globalGroup);
          }
          const globalIndex =
            this.plugin.settings.colorRuleGroups.indexOf(globalGroup);
          globalGroup.tagRules.unshift({ tag: "", color: "#4a90e2" });
          this.pendingFocusGroup = globalIndex;
          this.display();
          if (this.lastCreatedInput) this.lastCreatedInput.focus();
          this.pendingFocusGroup = -1;
        }),
    );

    addBtnSetting.addButton((btn) =>
      btn.setButtonText(t("ADD_FOLDER_SCOPE_BTN")).onClick(() => {
        this.plugin.settings.colorRuleGroups.unshift({
          folderScope: "",
          folderScopeMode: "include",
          tagRules: [],
        });
        this.display();
      }),
    );

    const rulesContainer = containerEl.createDiv({ cls: "tag-rules-list" });

    const validateAllTags = () => {
      const groupedElements: Map<number, typeof this.ruleElements> = new Map();
      this.ruleElements.forEach((el) => {
        if (!groupedElements.has(el.groupIndex)) {
          groupedElements.set(el.groupIndex, []);
        }
        groupedElements.get(el.groupIndex)!.push(el);
      });

      groupedElements.forEach((elements) => {
        const tagCounts: { [key: string]: number } = {};
        elements.forEach((el) => {
          const val = el.txt.value.replace(/^#/, "").toLowerCase().trim();
          if (val) tagCounts[val] = (tagCounts[val] || 0) + 1;
        });

        elements.forEach((el) => {
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
        });
      });
    };

    if (!Platform.isMobile) {
      this.renderDropZone(rulesContainer, 0);
    }

    this.plugin.settings.colorRuleGroups.forEach((group, groupIndex) => {
      const groupDiv = rulesContainer.createDiv({ cls: "tag-group" });
      const isScoped = group.folderScope !== undefined;
      if (isScoped) groupDiv.addClass("is-scoped");

      // GROUP HEADER (only for scoped groups)
      if (isScoped) {
        this.renderGroupHeader(groupDiv, group, groupIndex);
      }

      // TAG RULES
      const rulesDiv = groupDiv.createDiv({ cls: "tag-group-rules" });
      if (isScoped) {
        rulesDiv.addClass("is-indented");
      }

      group.tagRules.forEach((config, ruleIndex) => {
        this.renderTagRule(
          rulesDiv,
          config,
          group,
          groupIndex,
          ruleIndex,
          validateAllTags,
        );
      });

      if (group.tagRules.length === 0 && isScoped) {
        const emptyDiv = rulesDiv.createDiv({ cls: "tag-group-empty" });
        emptyDiv.setText(t("GROUP_EMPTY"));

        if (!Platform.isMobile) {
          emptyDiv.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.draggingRuleInfo !== null) {
              emptyDiv.addClass("is-drop-target");
            }
          });
          emptyDiv.addEventListener("dragleave", () => {
            emptyDiv.removeClass("is-drop-target");
          });
          emptyDiv.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            emptyDiv.removeClass("is-drop-target");
            if (this.draggingRuleInfo !== null) {
              const src = this.draggingRuleInfo;
              const srcGroup =
                this.plugin.settings.colorRuleGroups[src.groupIndex];
              const movedItem = srcGroup.tagRules.splice(src.ruleIndex, 1)[0];
              group.tagRules.push(movedItem);
              this.draggingRuleInfo = { groupIndex, ruleIndex: 0 };
              void this.plugin.saveSettings();
              this.display();
            }
          });
        }
      }

      if (!Platform.isMobile) {
        this.renderDropZone(rulesContainer, groupIndex + 1);
      }
    });

    validateAllTags();
  }

  private renderDropZone(container: HTMLElement, insertAtGroupIndex: number) {
    const dropZone = container.createDiv({ cls: "tag-group-drop-zone" });

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.draggingRuleInfo !== null) {
        dropZone.addClass("is-active");
      }
    });

    dropZone.addEventListener("dragleave", () => {
      dropZone.removeClass("is-active");
    });

    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.removeClass("is-active");
      if (this.draggingRuleInfo !== null) {
        const src = this.draggingRuleInfo;
        const srcGroup = this.plugin.settings.colorRuleGroups[src.groupIndex];
        const movedItem = srcGroup.tagRules.splice(src.ruleIndex, 1)[0];

        const groups = this.plugin.settings.colorRuleGroups;
        const prevGroup = groups[insertAtGroupIndex - 1];
        const nextGroup = groups[insertAtGroupIndex];

        if (prevGroup && prevGroup.folderScope === undefined) {
          prevGroup.tagRules.push(movedItem);
        } else if (nextGroup && nextGroup.folderScope === undefined) {
          nextGroup.tagRules.unshift(movedItem);
        } else {
          groups.splice(insertAtGroupIndex, 0, { tagRules: [movedItem] });
        }

        this.draggingRuleInfo = null;
        void this.plugin.saveSettings();
        this.display();
      }
    });
  }

  private renderGroupHeader(
    container: HTMLElement,
    group: ColorRuleGroup,
    groupIndex: number,
  ) {
    const headerDiv = container.createDiv({ cls: "tag-group-header" });

    if (this.draggingGroupIndex === groupIndex)
      headerDiv.addClass("is-dragging");

    if (Platform.isMobile) {
      // Mobile: arrow buttons for group reordering
      const reorderContainer = headerDiv.createDiv({
        cls: "tag-reorder-arrows",
      });
      const upBtn = reorderContainer.createEl("button", {
        cls: "clickable-icon",
      });
      setIcon(upBtn, "arrow-up");
      upBtn.onclick = () => {
        if (groupIndex > 0) {
          const moved = this.plugin.settings.colorRuleGroups.splice(
            groupIndex,
            1,
          )[0];
          this.plugin.settings.colorRuleGroups.splice(groupIndex - 1, 0, moved);
          void this.plugin.saveSettings();
          this.display();
        }
      };

      const downBtn = reorderContainer.createEl("button", {
        cls: "clickable-icon",
      });
      setIcon(downBtn, "arrow-down");
      downBtn.onclick = () => {
        if (groupIndex < this.plugin.settings.colorRuleGroups.length - 1) {
          const moved = this.plugin.settings.colorRuleGroups.splice(
            groupIndex,
            1,
          )[0];
          this.plugin.settings.colorRuleGroups.splice(groupIndex + 1, 0, moved);
          void this.plugin.saveSettings();
          this.display();
        }
      };
    } else {
      // Desktop: drag handle for group reordering
      headerDiv.draggable = true;
      const dragHandle = headerDiv.createDiv({
        cls: "clickable-icon drag-handle",
      });
      setIcon(dragHandle, "lucide-grip-vertical");

      headerDiv.addEventListener("dragstart", (e) => {
        e.stopPropagation();
        this.draggingGroupIndex = groupIndex;
        this.draggingRuleInfo = null;
        headerDiv.addClass("is-dragging");
      });

      headerDiv.addEventListener("dragend", () => {
        this.draggingGroupIndex = null;
        headerDiv.removeClass("is-dragging");
        this.display();
      });

      headerDiv.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Group-to-group reordering
        if (
          this.draggingGroupIndex !== null &&
          this.draggingGroupIndex !== groupIndex
        ) {
          const moved = this.plugin.settings.colorRuleGroups.splice(
            this.draggingGroupIndex,
            1,
          )[0];
          this.plugin.settings.colorRuleGroups.splice(groupIndex, 0, moved);
          this.draggingGroupIndex = groupIndex;
          void this.plugin.saveSettings();
          this.display();
        }
        // Rule dropped onto a group header → move rule into this group
        else if (
          this.draggingRuleInfo !== null &&
          this.draggingRuleInfo.groupIndex !== groupIndex
        ) {
          const src = this.draggingRuleInfo;
          const srcGroup = this.plugin.settings.colorRuleGroups[src.groupIndex];
          const movedItem = srcGroup.tagRules.splice(src.ruleIndex, 1)[0];
          group.tagRules.unshift(movedItem);
          this.draggingRuleInfo = { groupIndex, ruleIndex: 0 };
          void this.plugin.saveSettings();
          this.display();
        }
      });
    }

    const scopeBtn = headerDiv.createEl("button", {
      cls: "clickable-icon tag-folder-scope-btn",
    });
    const mode = group.folderScopeMode || "include";
    setIcon(scopeBtn, mode === "include" ? "folder-input" : "folder-minus");
    scopeBtn.title =
      mode === "include"
        ? t("FOLDER_SCOPE_INCLUDE")
        : t("FOLDER_SCOPE_EXCLUDE");
    scopeBtn.onclick = () => {
      const newMode =
        (group.folderScopeMode || "include") === "include"
          ? "exclude"
          : "include";
      group.folderScopeMode = newMode;
      setIcon(
        scopeBtn,
        newMode === "include" ? "folder-input" : "folder-minus",
      );
      scopeBtn.title =
        newMode === "include"
          ? t("FOLDER_SCOPE_INCLUDE")
          : t("FOLDER_SCOPE_EXCLUDE");
      void this.plugin.saveSettings();
    };

    const folderInputWrapper = headerDiv.createDiv({
      cls: "tag-folder-input-wrapper",
    });
    const folderTxt = createEl("input");
    folderTxt.type = "text";
    folderTxt.value = group.folderScope || "";
    folderTxt.placeholder =
      group.folderScope !== undefined
        ? t("FOLDER_PLACEHOLDER")
        : t("GLOBAL_SCOPE");
    folderTxt.addClass("tag-folder-input");
    folderInputWrapper.appendChild(folderTxt);

    new FolderSuggest(this.app, folderTxt);

    const debouncedFolderSave = debounce(
      async () => {
        group.folderScope = folderTxt.value;
        await this.plugin.saveSettings();
      },
      400,
      true,
    );

    folderTxt.oninput = () => debouncedFolderSave();
    folderTxt.onchange = () => {
      group.folderScope = folderTxt.value;
      void this.plugin.saveSettings();
    };

    const addBtn = headerDiv.createEl("button", { cls: "clickable-icon" });
    setIcon(addBtn, "plus");
    addBtn.title = t("ADD_RULE_TO_GROUP");
    addBtn.onclick = () => {
      group.tagRules.unshift({ tag: "", color: "#4a90e2" });
      this.pendingFocusGroup = groupIndex;
      this.display();
      if (this.lastCreatedInput) this.lastCreatedInput.focus();
      this.pendingFocusGroup = -1;
    };

    const del = headerDiv.createEl("button", { cls: "clickable-icon" });
    setIcon(del, "trash");
    del.onclick = () => {
      this.plugin.settings.colorRuleGroups.splice(groupIndex, 1);
      void this.plugin.saveSettings();
      this.display();
    };
  }

  private renderTagRule(
    container: HTMLElement,
    config: TagColorConfig,
    group: ColorRuleGroup,
    groupIndex: number,
    ruleIndex: number,
    validateAllTags: () => void,
  ) {
    const div = container.createDiv({ cls: "tag-color-setting-item" });

    if (Platform.isMobile) {
      const reorderContainer = div.createDiv({ cls: "tag-reorder-arrows" });
      const upBtn = reorderContainer.createEl("button", {
        cls: "clickable-icon",
      });
      setIcon(upBtn, "arrow-up");
      upBtn.onclick = () => {
        if (ruleIndex > 0) {
          const moved = group.tagRules.splice(ruleIndex, 1)[0];
          group.tagRules.splice(ruleIndex - 1, 0, moved);
          void this.plugin.saveSettings();
          this.display();
        }
      };

      const downBtn = reorderContainer.createEl("button", {
        cls: "clickable-icon",
      });
      setIcon(downBtn, "arrow-down");
      downBtn.onclick = () => {
        if (ruleIndex < group.tagRules.length - 1) {
          const moved = group.tagRules.splice(ruleIndex, 1)[0];
          group.tagRules.splice(ruleIndex + 1, 0, moved);
          void this.plugin.saveSettings();
          this.display();
        }
      };
    } else {
      if (
        this.draggingRuleInfo?.groupIndex === groupIndex &&
        this.draggingRuleInfo?.ruleIndex === ruleIndex
      ) {
        div.addClass("is-dragging");
      }
      div.draggable = true;
      const dragHandle = div.createDiv({ cls: "clickable-icon drag-handle" });
      setIcon(dragHandle, "lucide-grip-vertical");

      div.addEventListener("dragstart", (e) => {
        e.stopPropagation();
        validateAllTags();
        if (!txt.classList.contains("is-invalid") && txt.value.trim() !== "") {
          config.tag = txt.value;
          void this.plugin.saveSettings();
        }
        this.draggingRuleInfo = { groupIndex, ruleIndex };
        this.draggingGroupIndex = null;
        div.addClass("is-dragging");
      });

      div.addEventListener("dragend", () => {
        this.draggingRuleInfo = null;
        div.removeClass("is-dragging");
        this.display();
      });

      div.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.draggingRuleInfo !== null) {
          const src = this.draggingRuleInfo;
          if (src.groupIndex === groupIndex && src.ruleIndex === ruleIndex)
            return;

          const srcGroup = this.plugin.settings.colorRuleGroups[src.groupIndex];
          const movedItem = srcGroup.tagRules.splice(src.ruleIndex, 1)[0];

          let targetRuleIndex = ruleIndex;
          if (src.groupIndex === groupIndex && src.ruleIndex < ruleIndex) {
            targetRuleIndex--;
          }

          const targetGroup = this.plugin.settings.colorRuleGroups[groupIndex];
          targetGroup.tagRules.splice(targetRuleIndex, 0, movedItem);

          this.draggingRuleInfo = { groupIndex, ruleIndex: targetRuleIndex };

          void this.plugin.saveSettings();
          this.display();
        }
      });
    }

    const notBtn = div.createEl("button", {
      cls: "clickable-icon tag-not-btn",
    });
    setIcon(notBtn, config.isNegative ? "ban" : "check");

    setTooltip(
      notBtn,
      config.isNegative ? t("RULE_MATCH_NEGATIVE") : t("RULE_MATCH_POSITIVE"),
    );

    notBtn.onclick = () => {
      config.isNegative = !config.isNegative;
      setIcon(notBtn, config.isNegative ? "ban" : "check");

      setTooltip(
        notBtn,
        config.isNegative ? t("RULE_MATCH_NEGATIVE") : t("RULE_MATCH_POSITIVE"),
      );

      void this.plugin.saveSettings();
    };

    const cp = createEl("input");
    cp.type = "color";
    cp.value = config.color;
    cp.addClass("tag-color-picker-input");
    cp.onchange = (e: Event) => {
      config.color = (e.target as HTMLInputElement).value;
      void this.plugin.saveSettings();
    };
    div.appendChild(cp);

    const inputContainer = div.createDiv({ cls: "tag-input-container" });
    const fieldWrapper = inputContainer.createDiv({
      cls: "tag-input-field-wrapper",
    });

    const txt = createEl("input");
    txt.type = "text";
    txt.value = config.tag;
    txt.placeholder = t("TAG_PLACEHOLDER");
    if (ruleIndex === 0 && groupIndex === this.pendingFocusGroup) {
      this.lastCreatedInput = txt;
    }
    fieldWrapper.appendChild(txt);

    const errorMsg = inputContainer.createDiv({ cls: "tag-error-message" });

    this.ruleElements.push({ txt, error: errorMsg, groupIndex });
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
      validateAllTags();
      debouncedSave();
    };

    txt.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        validateAllTags();
        if (!txt.classList.contains("is-invalid")) {
          config.tag = txt.value;
          void this.plugin.saveSettings();
          txt.blur();
        }
      }
    });

    txt.onchange = (e: Event) => {
      config.tag = (e.target as HTMLInputElement).value;
      validateAllTags();
      void this.plugin.saveSettings();
    };

    txt.addEventListener("blur", () => {
      if (!txt.value || txt.value.trim() === "") {
        group.tagRules.splice(ruleIndex, 1);
        void this.plugin.saveSettings();
        this.display();
      }
    });

    const del = div.createEl("button", { cls: "clickable-icon" });
    setIcon(del, "trash");
    del.onclick = () => {
      group.tagRules.splice(ruleIndex, 1);
      void this.plugin.saveSettings();
      this.display();
    };
  }
}
