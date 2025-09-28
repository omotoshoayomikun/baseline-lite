# Baseline Lite (VS Code Extension)

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A Visual Studio Code extension that integrates [Web Platform Baseline](https://web.dev/baseline/) data directly into your editor.  
It highlights CSS, HTML, and JavaScript/TypeScript features that are **not yet universally supported**, helping developers adopt modern features confidently without breaking production.

---

## 🚀 Overview
As web developers, we often hesitate before using a new property, attribute, or API: *“Is it safe to use yet?”*  
Normally, you’d have to check MDN, caniuse.com, or blog posts. This extension removes that friction by surfacing **Baseline compatibility guidance inline while you code.**

- ✅ Inline badges show Baseline status (Limited / Newly / Widely).  
- ✅ Problems panel entries with severity (Warnings for Limited, Info for Newly).  
- ✅ Hover tooltips with feature details and MDN links.  
- ✅ Works with **CSS, HTML, JS/TS, and React (JSX/TSX)**.  

---

## ✨ Features

- **Inline Baseline Badges**  
  Displays `Baseline: Limited` or `Baseline: Newly` at the end of the line, with hover details.

- **Problems Panel Integration**  
  Findings appear in the Problems panel with proper severity. Clickable *MDN* links go straight to documentation.

- **Language Coverage**  
  - CSS: properties, values, at-rules, pseudos  
  - HTML: tags, attributes, attribute values  
  - JS/TS: Web APIs (`navigator.clipboard`, `AbortController`, etc.)  
  - React: JSX/TSX (via JS/TS analysis)

- **Configurable Presentation**  
  Choose how to view results:  
  - Diagnostics (Problems panel only)  
  - Decorations (inline badges only)  
  - Both (default)

- **Status Bar Summary**  
  Quick counts of Limited and Newly findings in the current file.

---

## 📷 Demo

Example in a CSS file:

```css
.card {
  backdrop-filter: blur(4px);   /* Baseline: Limited */
  cursor: pointer;              /* Baseline: Newly */
}

Example in a HTML file:

```html
<img src="photo.jpg" alt="demo" loading="lazy">  <!-- Baseline: Newly -->

Example in a Javascript file:

```Javascript
navigator.clipboard.readText();  // Baseline: Limited

## Problems panel view:
Baseline | backdrop-filter: Limited availability  (MDN)
Baseline | loading="lazy": Newly available        (MDN)


## ⚙️ Installation

**1. Clone this repository:**
git clone https://github.com/omotoshoayomikun/baseline-lite.git
cd baseline-lite

**2. Install Dependencies:**
npm install

**3. Clone this repository:**
npm run compile

**5. Open the project in VS Code, press F5 to launch the Extension Development Host, and test it.**
