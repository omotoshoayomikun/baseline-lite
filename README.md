# Baseline Web Features Linter

VS Code extension that highlights CSS, HTML, and JS/TS features not fully supported according to the Web Platform Baseline.

## Features
- **CSS**: properties, values, at-rules, pseudos
- **HTML**: tags and attributes
- **JS/TS**: Web APIs (e.g. `navigator.clipboard`, `ClipboardItem`)

## Settings
- `baselineLinter.coreProperties`: CSS properties to treat as Widely available.
- `baselineLinter.severityForLimited`: Severity for features with Baseline=false.

## Usage
Open a CSS/HTML/JS/TS file and hover over or type features to see warnings and tooltips.

## Development
```bash
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
