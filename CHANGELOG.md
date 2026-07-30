# Changelog

## 2.1.0

### UI/UX enhancements and bug fixes

* The plugin settings were migrated to the declarative Obsidian 1.13.0 API — they are now discoverable through the settings search.
* Fixed the settings layout under Obsidian 1.13: dropdowns and buttons are vertically centered in their rows again, and the rule-adding row now shows its description above two full-width buttons.
* The minimum Obsidian version was raised to 1.13.0. Users on older versions still get plugin version 2.0.0.


## 2.0.0

### Major update: folder rules

> **Notice:** your existing rules almost certainly will stop working after the update. A backup is highly recommended.

This release introduces one major change and multiple quality-of-life enhancements.

* **Folder rules.** Apply coloring only to the files inside a specified folder. Thanks to @filipjaruska for the idea.
* **New filter for positive/negative tag matching.**
* New design and layout for rules of both types.

### Performance optimizations and fixes

* Fixed a bug where non-text files were not skipped during scanning.
* Debounced DOM updates.
* Single-pass tag/folder normalization.

### Other

* READMEs were updated.
* Locales were updated.

Thanks to @filipjaruska for his contributions in PR #4.


## 1.5.0

### New features

* **Negative tag matching** by @filipjaruska — now you can choose whether the rule should check if the tag is present or absent in the notes (PR #3).

### UI/UX enhancements and bug fixes

* Fixed a settings export bug.
* Updated the features description in the READMEs.

### Other

* Added artifact attestation.
* Updated `.gitignore`.

@filipjaruska made their first contribution in PR #3.


## 1.4.2

### We're in the store now! 🔥

First official release for the Obsidian plugin store, with minor updates and fixes for stability and safety.

Find the plugin in the store: https://community.obsidian.md/plugins/tags-color-files


## 1.4.1

### UI/UX enhancements and bug fixes

* Some locales updates.
* Updated styles to move the dots closer to note files, by @egorgvo (PR #2).

@egorgvo made their first contribution in PR #1.


## 1.4.0

### New features

* Added the new coloring methods "Dots before text + text" and "Dots after text + text", which combine the already existing methods.


## 1.3.2

### UI/UX enhancements and bug fixes

* Hotfixes for the previous release.
* Removed the export button on mobile devices due to inability to make it work. It might return later.


## 1.3.1

### UI/UX enhancements and bug fixes

* Hotfixes for export (mobile) and for the saving-to-database logic (mobile and desktop).


## 1.3.0

### New features

* Complete mobile optimization.
* New error message when an invalid tag name is entered while creating a new rule.
* UI/UX design enhancements.

### Bugs and other fixes

* READMEs updates and corrections.
* Various fixes for the Obsidian community plugins review process.
* Locales updates.


## 1.2.0

### New features

* Added an error message when conflicting rules are created.
* From now on the plugin ignores the `#` symbol and the input casing when a new coloring rule is created.
* The drag-and-drop function for coloring rules was completely rewritten and now looks much fancier.

### Bug fixes and other improvements

* Fixed deletion of tags from the plugin database when dragging and dropping them in the plugin settings.
* Updated locales.


## 1.0.2

* Minor updates to the repository structure.


## 1.0.1

* Description fixes for the initial release.


## 1.0.0

* Initial release.
