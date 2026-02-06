# Tags Color Files Plugin

English | [Русский](https://github.com/pan4ratte/obsidian-tags-color-files/blob/main/README_RU.md)

This plugin allows you to automatically highlight files in your Obsidian explorer with different colors based on the tags they contain. File colors are determined by rules that you create in the plugin settings by entering a tag and assigning a color to it. After adding a tag for which a rule has been created to a file, that file is colored accordingly in the Obsidian explorer.


## Features

1. Automatic file highlighting in the Obsidian file explorer based on the tag-color rules that you create.

2. Tag prioritization in the plugin settings by dragging and dropping. Useful for cases, when a single file contains more than one tag for which coloring rule was created. The plugin will select the tag with the highest priority to color that file.

3. Coloring method choices: not only basic ones, like "Text" and "Background", but also advanced, such as "Dots Before Text" and "Dots After Text". When choosing advanced options, up to three colored dots are displayed simultaneously in the file explorer if a single file contains multiple tags for which coloring rules have been created.

4. Export and import of plugin settings to a file.

5. Localization support. Currently available languages: English and Russian.


## Plugin Use Case

Initially, the plugin was created for my personal needs. When reading literature, I tag certain quotes with such tags as `#key-idea` or `#disagree` to highlight relevant thoughts. It would be more convenient for me to see such quotes in the Obsidian explorer without having to filter notes by tags in the search bar or in the tag pane. — This plugin solves exactly that problem, and I can imagine that there could be much more creative use cases for it.


## Contributions and Roadmap

I am open to suggestions and new ideas that expand the plugin's functionality. Below are some planned updates — some of them I cannot implement myself (I'm not a programmer), but they would be huge quality of life improvements:

- [ ] Complete code audit. This plugin was almost entirely vibecoded and there should be done a lot of cleanup and optimization.

- [ ] Visual enhancement of the “Dots Before text” and “Dots After Text” coloring methods. Currently I am not completely satisfied with the integration of these coloring methods to the Obsidian's interface. They should be updated to avoid conflicts with other interface elements.

- [ ] Prevention of creation of two rules for the same tag.

- [ ] Suggestions of existing tags while creating a new rule.


## About Author

My name is Mark Ingram (Ingrem), and I am a religious studies scholar. Apart from my main direction of research (Protestant Political Theology in Russia), I teach the subject "Information Technologies in Scientific Research", a unique course developed by me. This plugin helps me in my studies and I use it in my teaching. Hello to every student that came across this page!