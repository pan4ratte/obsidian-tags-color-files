# Tags Color Files Plugin

English | [Русский](https://github.com/pan4ratte/obsidian-tags-color-files/blob/main/README_RU.md)

This plugin allows you to automatically highlight files in your Obsidian explorer with different colors based on the tags they contain. File colors are determined by rules that you create in the plugin settings by entering a tag and assigning a color to it. After adding a tag for which a rule has been created to a file, that file is colored accordingly in the Obsidian explorer.


## Features

1. Create rules for coloring files based on the tag-color principle.

2. Prioritize tags by changing their order in the settings by dragging and dropping. If a file contains several tags for which rules have been created, the plugin will select the tag with the highest priority to color that file.

3. Choose the coloring method: text, background, colored dots before the file name, or colored dots after the file name. When choosing the options before or after the text, up to three colored dots are displayed simultaneously if a single file contains multiple tags for which coloring rules have been created.

4. Export and import plugin settings to a file.

5. Localization support. Currently available languages: English, Russian.


## Plugin Use Case

Initially, the plugin was created for my personal needs. When reading literature, I tag certain quotes with tags such as `#key-idea` or `#disagree` when I want to highlight relevant thoughts. It is convenient for me to see such quotes in the Obsidian explorer without having to filter by tags through the search function. This plugin solves exactly that problem.


## Known Issues and Contribution

I am open to suggestions and new ideas that expand the plugin's functionality. Here are a few ideas:

1. This plugin was almost entirely vibecoded. Considering this, the plugin requires a full code audit for cleanup and optimization.

2. The “Dots Before text” and “Dots After Text” coloring methods are currently poorly integrated into the explorer interface. The code needs to be updated so that these coloring methods do not conflict with other interface elements.

3. A mechanism needs to be developed to prevent the creation of two rules for the same tag.


4. To improve the user experience, it would be nice to add suggestions while typing a tag when creating a new rule.


