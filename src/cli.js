import process from "node:process";

export const VALID_THEMES = [
  "light",
  "dark",
  "sepia",
  "groove-dark",
  "solarized-light",
  "solarized-dark",
  "nord-light",
  "nord-dark",
];

export function parseArgs() {
  const args = process.argv.slice(2);
  const url = args[0];
  const opts = { theme: null, css: null, prefs: null, output: null };
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--theme" && args[i + 1]) opts.theme = args[++i];
    else if (args[i] === "--css" && args[i + 1]) opts.css = args[++i];
    else if (args[i] === "--prefs" && args[i + 1]) opts.prefs = args[++i];
    else if (args[i] === "--output" && args[i + 1]) opts.output = args[++i];
  }
  if (
    !opts.theme &&
    args[1] &&
    !args[1].startsWith("-") &&
    VALID_THEMES.includes(args[1])
  ) {
    opts.theme = args[1];
  }
  return { url, opts };
}

export function printUsage() {
  console.error("Usage: node src/index.js <URL> [theme] [options]");
  console.error("");
  console.error("Options:");
  console.error(
    "  --theme <theme>    Reader View theme (" + VALID_THEMES.join(", ") + ")",
  );
  console.error("  --css <path>       Path to custom CSS file");
  console.error("  --prefs <path>     Path to extension preferences JSON");
  console.error(
    "  --output <path>    Output file path (default: ./output/<title>.pdf)",
  );
  console.error("");
  console.error("Examples:");
  console.error("  node src/index.js <URL>");
  console.error("  node src/index.js <URL> dark --css config/rules.css");
  console.error("");
  console.error("IMPORTANT: npm start consumes --flags as npm config.");
  console.error("Use node directly or add -- before flags:");
  console.error(
    "  node src/index.js <URL> --theme dark --css config/rules.css",
  );
  console.error("  npm start -- <URL> --theme dark --css config/rules.css");
  console.error("");
}
