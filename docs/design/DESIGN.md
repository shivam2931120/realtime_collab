# Editorial visual system

## Direction

Linear-inspired workspace structure with a calm, document-first editor inspired by Craft. Preserve Editorial's orange identity using a burnt orange fill with sufficient contrast for white button labels. Navigation and text use a brighter accent. All product and public surfaces are dark charcoal.

References: https://linear.app/now/behind-the-latest-design-refresh and https://www.craft.do/customize. These are visual references; no third-party components or assets are copied.

## Single source of truth

`frontend/design-tokens.json` defines color, corner radius, and fonts. `npm run theme` generates `frontend/public/theme.css`; `npm run build` also regenerates it. Tailwind explicitly loads the tracked `tailwind.config.ts` (never an ignored generated JavaScript config) and consumes its RGB variables, MUI and Clerk consume the same JSON, and the static public pages import the generated stylesheet.

- Background #111214; sidebar #16181c; panels #1d2025; raised controls #262a31.
- Main text #f2f3f5; secondary #a7adb7; tertiary #858d9b.
- Primary fill #c94b27; text accent #ff9b7a. White button text has a contrast ratio above 4.5:1.
- Green communicates successful state; red communicates errors; orange communicates actions and selected tools.
- 6px controls, 10px panels, 14px dialogs. Avatars and presence indicators remain circular.
- IBM Plex Sans for the interface and document default. Explicit document colors and highlights remain author-controlled.
- Spacing follows 4/8px increments; navigation rows are 38px high. Mobile inputs use 16px text to avoid automatic zoom.

## Components and behavior

`WorkspaceSidebar` is shared by the dashboard and editor. It uses the existing routes and saved collapsed preference, groups navigation by purpose, and exposes all routes through an accessible mobile drawer. Escape closes the drawer and focus returns to its trigger.

The writing assistant keeps its existing generation and insertion handlers. Its presentation becomes a right drawer on desktop and a bottom sheet on mobile. Editor menus, save/sync, collaboration, comments, versions, sharing, and export retain their handlers and API contracts. No backend or authentication changes are part of this redesign.

## Consistency rules

Use semantic Tailwind colors and shared controls. Never use substring selectors such as `[class*="text-"]` to override unrelated elements. Do not style document-authored inline colors. Do not flatten avatar radii or semantic error/success colors. Hide secondary chrome only through the existing focus-mode preference. Respect reduced motion and preserve visible keyboard focus.

## Preview

Open `design-preview.html` for a self-contained token and component preview. Real authenticated screens are verified in the browser against the production API before release.
