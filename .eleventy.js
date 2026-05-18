const { DateTime } = require("luxon");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("./src/styles.css");
  eleventyConfig.addPassthroughCopy("./src/theme.js");
  eleventyConfig.addPassthroughCopy("./src/assets");
  eleventyConfig.addPassthroughCopy("./src/robots.txt");
  eleventyConfig.addFilter("postDate", (dateObj) => {
    if (!dateObj) return "Invalid Date";

    let date;
    if (typeof dateObj === 'string') {
      date = DateTime.fromISO(dateObj);
    } else if (dateObj instanceof Date) {
      date = DateTime.fromJSDate(dateObj);
    } else {
      date = DateTime.fromISO(dateObj.toString());
    }

    return date.isValid ? date.toLocaleString(DateTime.DATE_MED) : "Invalid Date";
  });

  eleventyConfig.addFilter("iso8601", (dateObj) => {
    if (!dateObj) return "";

    let date;
    if (typeof dateObj === 'string') {
      date = DateTime.fromISO(dateObj);
    } else if (dateObj instanceof Date) {
      date = DateTime.fromJSDate(dateObj);
    } else {
      date = DateTime.fromISO(dateObj.toString());
    }

    return date.isValid ? date.toISO() : "";
  });

  eleventyConfig.addFilter("rssDate", (dateObj) => {
    if (!dateObj) return "";

    let date;
    if (typeof dateObj === 'string') {
      date = DateTime.fromISO(dateObj);
    } else if (dateObj instanceof Date) {
      date = DateTime.fromJSDate(dateObj);
    } else {
      date = DateTime.fromISO(dateObj.toString());
    }

    return date.isValid ? date.toRFC2822() : "";
  });

  return {
    dir: {
      input: "src",
      output: "public",
    },
  };
};
