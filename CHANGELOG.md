# Changelog

## 2.3.0

### New features

* **Coloring wikilinks in notes.** A new "Color links to notes" toggle has been added to the general settings. When it's on, the coloring rules also apply to wikilinks inside notes. A link takes the color of the note it links to.
* **Changelog in the plugin.** After an update, the plugin settings show a notification from which you can open the changelog of the new version. Once dismissed, it won't appear again until the next update. The changelog can also be opened with the "View changelog" command.

### Improvements and bug fixes

* The general settings of the plugin are now combined into one shared block.
* The plugin title and description were removed from the top of the settings tab, in line with Obsidian's guidelines.


## 2.2.0

### New features

* **Bases support.** A new "Color file names in Bases" toggle has been added to the general settings. When it's on, the coloring rules apply to the file names in the Bases "Table" and "List" views. Whichever coloring method is selected, only the text color changes.

### Improvements and bug fixes

* Fixed a bug where hovering the pointer over a file name dropped the color set by the rule, and the name was shown in the default text color.


## 2.1.1

### Improvements and bug fixes

* Minor UI tweaks.
* Fixes that improve security and stability.


## 2.1.0

### Improvements and bug fixes

* The plugin settings were migrated to the declarative Obsidian 1.13.0 API — they can now be found through the settings search.
* Fixed a bug where the settings scrolled back to the top every time the rules list was redrawn. It was most disruptive when dragging rules: reordering a long list was very inconvenient.
* The minimum Obsidian version was raised to 1.13.0. Users of earlier Obsidian versions still get plugin version 2.0.0.


## 2.0.0

### Major update: folder rules

> **Notice:** after the update, rules created earlier will almost certainly stop working. We strongly recommend making a backup beforehand.

This release brings one major change and many smaller improvements that make working with the plugin more convenient.

* **Folder rules.** You can now color only the files inside a chosen folder. Thanks to @filipjaruska for the idea.
* **New filter: a rule can check for either the presence or the absence of a tag.**
* Updated design and layout of the elements in rules of both types.

### Performance optimizations and fixes

* Fixed a bug where non-text files were not skipped during scanning.
* DOM updates are now deferred and batched (debounced).
* Tags and folders are normalized in a single pass.

### Other

* README files were updated.
* Interface translations were updated.

Thanks to @filipjaruska for the help in PR #4.


## 1.5.0

### New features

* **Checking for a missing tag** (by @filipjaruska, PR #3). You can now choose when a rule applies: when the note has the tag, or when it doesn't.

### Improvements and bug fixes

* Fixed a settings export bug.
* Updated the description of the plugin's features in the README files.

### Other

* Added build artifact attestation.
* Updated `.gitignore`.

First contribution to the project by @filipjaruska: PR #3.


## 1.4.2

### The plugin is now in the store! 🔥

First official release in the Obsidian plugin store. It also includes minor updates and fixes that improve stability and safety.

The plugin's page in the store: https://community.obsidian.md/plugins/tags-color-files


## 1.4.1

### Improvements and bug fixes

* Interface translations were updated.
* The dots are now placed closer to file names (by @egorgvo, PR #2).

First contribution to the project by @egorgvo: PR #1.


## 1.4.0

### New features

* Added the coloring methods "Dots before text + text" and "Dots after text + text", which combine the already existing methods.


## 1.3.2

### Improvements and bug fixes

* Hotfixes for bugs in the previous release.
* The export button was removed on mobile devices, as it hasn't been possible to make it work yet. It might return later.


## 1.3.1

### Improvements and bug fixes

* Hotfixes for export (on mobile devices) and for saving plugin data (on mobile devices and desktop).


## 1.3.0

### New features

* The plugin is now fully adapted for mobile devices.
* An error message now appears if an invalid tag name is entered while creating a rule.
* Improved interface design.

### Bug fixes and other changes

* README files were updated and corrected.
* Various fixes following the plugin's review before publication in the Obsidian plugin store.
* Interface translations were updated.


## 1.2.0

### New features

* Added an error message when conflicting rules are created.
* The plugin now ignores the `#` symbol and letter case when a coloring rule is created.
* Dragging coloring rules was completely rewritten and now looks much nicer.

### Bug fixes and other improvements

* Fixed a bug where tags were deleted from the plugin database when rules were dragged in the settings.
* Interface translations were updated.


## 1.0.2

* Minor changes to the repository structure.


## 1.0.1

* Fixed the plugin description for the initial release.


## 1.0.0

* Initial release.
