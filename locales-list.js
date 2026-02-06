"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.t = void 0;
var obsidian_1 = require("obsidian");
var en_1 = require("./locales/en");
var ru_1 = require("./locales/ru"); // Import other languages here
var localeMap = {
    en: en_1.default,
    ru: ru_1.default,
    // Add other mappings here
};
var t = function (key) {
    // moment.locale() returns 'en', 'ru', 'zh-cn', etc.
    var lang = obsidian_1.moment.locale();
    var targetLocale = localeMap[lang] || localeMap['en'];
    return targetLocale[key] || localeMap['en'][key] || key;
};
exports.t = t;
