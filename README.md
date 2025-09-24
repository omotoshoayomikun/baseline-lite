
# Baseline Web Features Linter

This VS Code extension highlights CSS features that are not fully supported according to the [Web Platform Baseline](https://web.dev/baseline/).

## Files
- `src/baseline.ts` — builds the Baseline index from **web-features** and MDN BCD (types + helpers).
- `src/diagnostics.ts` — scans CSS and emits diagnostics for Baseline **low** or **false**.
- `src/hovers.ts` — hover tooltips with status, dates, and MDN link.
- `src/extension.ts` — wires it all together in VS Code.

## Install / Run
```bash
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

## Notes
- Baseline status mapping strictly follows official docs:
  - `high` → Widely available
  - `low`  → Newly available
  - `false` → Limited availability
