import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	getAllTags,
	Notice,
	setIcon,
	AbstractInputSuggest,
	MetadataCache
} from 'obsidian';
import { t } from './locales-list';

// Helper class for tag suggestions
class TagSuggest extends AbstractInputSuggest<string> {
	constructor(app: App, public inputEl: HTMLInputElement) {
		super(app, inputEl);
	}

	getSuggestions(query: string): string[] {
		// Casting to access internal getTags method
		const cache = this.app.metadataCache as MetadataCache & { getTags(): Record<string, number> };
		const allTags = Object.keys(cache.getTags());
		const normalizedQuery = query.startsWith('#') ? query.toLowerCase() : '#' + query.toLowerCase();
		return allTags.filter(tag => tag.toLowerCase().contains(normalizedQuery));
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

interface TagColorConfig {
	tag: string;
	color: string;
}

interface TagsColorFilesSettings {
	tagColors: TagColorConfig[];
	colorStrategy: 'text' | 'background' | 'before-text' | 'after-text';
	dotSize: 'small' | 'default' | 'big';
}

const DEFAULT_SETTINGS: TagsColorFilesSettings = {
	tagColors: [],
	colorStrategy: 'text',
	dotSize: 'default'
};

export default class TagsColorFilesPlugin extends Plugin {
	settings: TagsColorFilesSettings;
	observer: MutationObserver;
	isUpdating = false;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new TagsColorFilesSettingTab(this.app, this));

		this.registerEvent(this.app.metadataCache.on('changed', () => this.updateFileColors()));
		this.registerEvent(this.app.vault.on('rename', () => this.updateFileColors()));
		this.registerEvent(this.app.workspace.on('layout-change', () => this.updateFileColors()));

		this.observer = new MutationObserver((mutations) => {
			if (this.isUpdating) return;
			let shouldUpdate = false;
			for (const m of mutations) {
				for (const node of Array.from(m.addedNodes)) {
					if (node instanceof HTMLElement && (node.classList.contains('nav-file') || node.querySelector('.nav-file-title'))) {
						shouldUpdate = true;
						break;
					}
				}
				if (shouldUpdate) break;
			}
			if (shouldUpdate) this.updateFileColors();
		});

		this.app.workspace.onLayoutReady(() => {
			this.observer.observe(document.body, { childList: true, subtree: true });
			setTimeout(() => this.updateFileColors(), 500);
		});
	}

	onunload() {
		if (this.observer) this.observer.disconnect();
		this.removeFileColors();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		this.settings.tagColors = this.settings.tagColors.filter(rule => rule.tag && rule.tag.trim() !== "");
		await this.saveData(this.settings);
		this.updateFileColors();
	}

	removeFileColors() {
		const fileExplorers = this.app.workspace.getLeavesOfType('file-explorer');
		fileExplorers.forEach((leaf) => {
			const navFiles = leaf.view.containerEl.querySelectorAll('.nav-file-title');
			navFiles.forEach((el: HTMLElement) => this.cleanElement(el));
		});
	}

	private cleanElement(el: HTMLElement) {
		el.classList.remove('colored-tag-file', 'strategy-text', 'strategy-background', 'strategy-before-text', 'strategy-after-text');
		el.style.removeProperty('--tag-file-color');
		const existingDots = el.querySelector('.tag-dots-container');
		if (existingDots) existingDots.remove();
	}

	updateFileColors() {
		if (this.isUpdating) return;
		window.requestAnimationFrame(() => {
			this.isUpdating = true;
			const fileExplorers = this.app.workspace.getLeavesOfType('file-explorer');
			fileExplorers.forEach((leaf) => {
				const navFiles = leaf.view.containerEl.querySelectorAll('.nav-file-title');
				navFiles.forEach((el: HTMLElement) => {
					const path = el.getAttribute('data-path');
					if (!path) return;
					const file = this.app.vault.getAbstractFileByPath(path);
					if (file instanceof TFile) {
						const cache = this.app.metadataCache.getFileCache(file);
						const fileTags = cache ? getAllTags(cache) : null;
						this.cleanElement(el);
						if (!fileTags || this.settings.tagColors.length === 0) return;
						const matchedColors: string[] = [];
						for (const config of this.settings.tagColors) {
							if (!config.tag) continue;
							const normalizedConfig = config.tag.replace(/^#/, '').toLowerCase();
							if (fileTags.some(t => t.replace(/^#/, '').toLowerCase() === normalizedConfig)) {
								matchedColors.push(config.color);
							}
						}
						if (matchedColors.length > 0) {
							el.classList.add('colored-tag-file');
							el.classList.add(`strategy-${this.settings.colorStrategy}`);
							el.style.setProperty('--tag-file-color', matchedColors[0]);

							if (this.settings.colorStrategy === 'before-text' || this.settings.colorStrategy === 'after-text') {
								const dotsContainer = document.createElement('div');
								const isBefore = this.settings.colorStrategy === 'before-text';
								dotsContainer.className = `tag-dots-container ${isBefore ? 'is-before' : 'is-after'} dots-${this.settings.dotSize}`;
								
								matchedColors.slice(0, 3).forEach((color, i) => {
									const dot = document.createElement('div');
									dot.className = 'tag-dot';
									dot.style.setProperty('--dot-color', color);
									dot.style.setProperty('--dot-index', i.toString());
									dotsContainer.appendChild(dot);
								});
								el.appendChild(dotsContainer);
							}
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
	draggingIndex: number | null = null;
	lastCreatedInput: HTMLInputElement | null = null;
	ruleElements: { txt: HTMLInputElement, error: HTMLElement }[] = [];

	constructor(app: App, plugin: TagsColorFilesPlugin) { 
		super(app, plugin); 
		this.plugin = plugin; 
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.ruleElements = [];

		new Setting(containerEl)
			.setName(t('SETTINGS_TITLE'))
			.setHeading();
		
		const descContainer = containerEl.createDiv({ cls: 'plugin-description-container' });
		descContainer.createEl('p', { text: t('PLUGIN_DESCRIPTION'), cls: 'setting-item-description' });
		
		new Setting(containerEl)
			.setName(t('GENERAL_SECTION'))
			.setHeading();

		new Setting(containerEl)
			.setName(t('COLOR_METHOD_NAME'))
			.setDesc(t('COLOR_METHOD_DESC'))
			.addDropdown((dropdown) => {
				dropdown
					.addOption('text', t('COLOR_TEXT'))
					.addOption('background', t('COLOR_BG'))
					.addOption('before-text', t('COLOR_DOTS_BEFORE'))
					.addOption('after-text', t('COLOR_DOTS_AFTER'))
					.setValue(this.plugin.settings.colorStrategy)
					.onChange(async (value: TagsColorFilesSettings['colorStrategy']) => {
						this.plugin.settings.colorStrategy = value;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		if (this.plugin.settings.colorStrategy === 'before-text' || this.plugin.settings.colorStrategy === 'after-text') {
			new Setting(containerEl)
				.setName(t('DOT_SIZE_NAME'))
				.setDesc(t('DOT_SIZE_DESC'))
				.addDropdown((dropdown) => {
					dropdown
						.addOption('small', t('DOT_SMALL'))
						.addOption('default', t('DOT_DEFAULT'))
						.addOption('big', t('DOT_BIG'))
						.setValue(this.plugin.settings.dotSize)
						.onChange(async (value: TagsColorFilesSettings['dotSize']) => {
							this.plugin.settings.dotSize = value;
							await this.plugin.saveSettings();
						});
				});
		}

		new Setting(containerEl)
			.setName(t('BACKUP_RESTORE'))
			.addButton((btn) => btn.setButtonText(t('EXPORT')).onClick(() => {
				const data = JSON.stringify(this.plugin.settings.tagColors, null, 2);
				const blob = new Blob([data], { type: 'application/json' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url; a.download = `tags-color-settings.json`; a.click();
				URL.revokeObjectURL(url);
				new Notice(t('EXPORTED'));
			}))
			.addButton((btn) => btn.setButtonText(t('IMPORT')).onClick(() => {
				const input = document.createElement('input');
				input.type = 'file'; input.accept = '.json';
				// Fix: Removed 'async' as there is no 'await' in this top-level arrow
				input.onchange = (e: Event) => {
					const target = e.target as HTMLInputElement;
					const file = target.files?.[0];
					if (!file) return;
					const reader = new FileReader();
					reader.onload = async (event: ProgressEvent<FileReader>) => {
						try {
							const result = event.target?.result;
							if (typeof result === 'string') {
								const parsed = JSON.parse(result);
								if (Array.isArray(parsed)) {
									this.plugin.settings.tagColors = parsed;
									await this.plugin.saveSettings(); 
									this.display();
									new Notice(t('IMPORTED'));
								}
							}
						} catch (err) { new Notice(t('INVALID_FILE')); }
					};
					reader.readAsText(file);
				};
				input.click();
			}));

		containerEl.createEl('hr');
		
		new Setting(containerEl)
			.setName(t('RULES_SECTION'))
			.setHeading();

		new Setting(containerEl)
			.setName(t('ADD_RULE_NAME'))
			.setDesc(t('ADD_RULE_DESC'))
			.addButton((btn) => btn
				.setButtonText(t('ADD_RULE_BTN'))
				.setCta()
				// Fix: Removed 'async' as there is no 'await' in this arrow
				.onClick(() => {
					this.plugin.settings.tagColors.unshift({ tag: '', color: '#4a90e2' });
					this.display();
					if (this.lastCreatedInput) this.lastCreatedInput.focus();
				})
			);

		const rulesContainer = containerEl.createDiv({ cls: 'tag-rules-list' });

		this.plugin.settings.tagColors.forEach((config, index) => {
			const div = rulesContainer.createDiv({ cls: 'tag-color-setting-item' });
			
			if (this.draggingIndex === index) {
				div.addClass('is-dragging');
			}

			div.draggable = true;

			div.addEventListener('dragstart', () => { 
				this.draggingIndex = index; 
				div.addClass('is-dragging'); 
			});

			div.addEventListener('dragend', () => { 
				this.draggingIndex = null; 
				div.removeClass('is-dragging'); 
				this.display(); 
			});

			div.addEventListener('dragover', async (e) => {
				e.preventDefault();
				if (this.draggingIndex !== null && this.draggingIndex !== index) {
					const movedItem = this.plugin.settings.tagColors.splice(this.draggingIndex, 1)[0];
					this.plugin.settings.tagColors.splice(index, 0, movedItem);
					this.draggingIndex = index; 
					await this.plugin.saveSettings();
					this.display();
				}
			});

			div.addEventListener('drop', (e) => { e.preventDefault(); });

			const dragHandle = div.createEl('div', { cls: 'clickable-icon drag-handle' });
			setIcon(dragHandle, 'lucide-grip-vertical');

			const cp = document.createElement('input');
			cp.type = 'color'; 
			cp.value = config.color;
			cp.addClass('tag-color-picker-input');
			cp.onchange = async (e: Event) => { 
				config.color = (e.target as HTMLInputElement).value; 
				await this.plugin.saveSettings(); 
			};
			div.appendChild(cp);

			const inputContainer = div.createDiv({ cls: 'tag-input-container' });
			const fieldWrapper = inputContainer.createDiv({ cls: 'tag-input-field-wrapper' });
			
			const txt = document.createElement('input');
			txt.type = 'text'; 
			txt.value = config.tag;
			txt.placeholder = t('TAG_PLACEHOLDER');
			if (index === 0) this.lastCreatedInput = txt;
			fieldWrapper.appendChild(txt);

			const errorMsg = inputContainer.createEl('div', { 
				cls: 'tag-error-message', 
				text: t('DUPLICATE_TAG_ERROR') 
			});

			this.ruleElements.push({ txt, error: errorMsg });

			new TagSuggest(this.app, txt);

			const validateAllTags = () => {
				const tagCounts: { [key: string]: number } = {};
				this.ruleElements.forEach(el => {
					const val = el.txt.value.replace(/^#/, '').toLowerCase().trim();
					if (val) tagCounts[val] = (tagCounts[val] || 0) + 1;
				});

				this.ruleElements.forEach(el => {
					const val = el.txt.value.replace(/^#/, '').toLowerCase().trim();
					if (val && tagCounts[val] > 1) {
						el.txt.addClass('is-invalid');
						el.error.addClass('is-visible');
					} else {
						el.txt.removeClass('is-invalid');
						el.error.removeClass('is-visible');
					}
				});
			};

			txt.oninput = validateAllTags;
			txt.onchange = async (e: Event) => { 
				config.tag = (e.target as HTMLInputElement).value; 
				validateAllTags();
				await this.plugin.saveSettings(); 
			};
			
			txt.addEventListener('blur', async () => {
				if (!txt.value || txt.value.trim() === '') {
					this.plugin.settings.tagColors.splice(index, 1);
					await this.plugin.saveSettings();
					this.display();
				}
			});

			const del = div.createEl('button', { cls: 'clickable-icon' });
			setIcon(del, 'trash');
			del.onclick = async () => {
				this.plugin.settings.tagColors.splice(index, 1);
				await this.plugin.saveSettings(); 
				this.display();
			};
		});
		
		if (this.ruleElements.length > 0) {
			const tagCounts: { [key: string]: number } = {};
			this.ruleElements.forEach(el => {
				const val = el.txt.value.replace(/^#/, '').toLowerCase().trim();
				if (val) tagCounts[val] = (tagCounts[val] || 0) + 1;
			});
			this.ruleElements.forEach(el => {
				const val = el.txt.value.replace(/^#/, '').toLowerCase().trim();
				if (val && tagCounts[val] > 1) {
					el.txt.addClass('is-invalid');
					el.error.addClass('is-visible');
				}
			});
		}
	}
}