# Pamana presentation system

## Source of truth

`css/style.css` is the shared presentation layer. Existing application JS controls data, validation, status transitions, roles, and navigation behavior. Never change those contracts to achieve a visual effect.

## Tokens

Forest `#174C3A` and deep forest `#10382D` provide primary actions and identity. Cream `#F8F5ED`, white `#FFFDF9`, sage-light `#E7EEE4`, and blue-light `#EDF4F6` form the surface system. Terracotta `#C96B49` is decorative; use the darker `--pamana-terracotta-ink` behind white control text. Main text is `#17332E`; the muted text token was darkened to `#596D64` for contrast.

Spacing uses `--space-1` through `--space-8`. Radii are 12px, 18px, 28px, and pill. Motion defaults to 180ms ease-out. Use the existing small/card/hover shadow tokens instead of introducing page-specific shadows.

## Typography

Use the serif stack for page headings, heritage names, story titles, and section headings. Use the system sans-serif stack for text, metadata, controls, forms, and management tables. Historical narratives and stories use a maximum reading measure of 66ch and retain their line breaks.

## Components

- Navigation: `.pamana-navbar`, `.pamana-brand`, `.pamana-mobile-nav`, `.home-bottom-nav`.
- Surfaces: `.pamana-section`, `.pamana-card`, `.starter-card`, `.starter-panel`.
- Existing dynamic cards: `.heritage-card`, `.heritage-card-body`, `.heritage-card-image`.
- Forms: `.pamana-form-card`, `.form-section`, `.pamana-form-section`, `.form-section-header`, `.upload-panel`.
- Statuses: `.badge-status-submitted`, `.badge-status-published`, `.badge-status-rejected`, `.badge-status-active`, `.badge-status-archived`. These styles do not create new database states.
- Workspaces: `.portal-hero`, `.pamana-stat-card`, `.admin-shell`, `.admin-sidebar`, `.admin-page-header`.
- Tables: `.pamana-table-card`, `.pamana-table`, `.table-responsive`, `.table-scroll-hint`.
- Reading/review: `.story-editorial`, `.heritage-reading-grid`, `.review-layout`, `.review-action-grid`.

Use Bootstrap's existing grid, collapse, modal, form and button behavior. Do not add a second JS controller for these components.

## Icons

The SVG sprite is at `assets/icons/sprite.svg`. A static decorative icon can be embedded as:

```html
<svg class="pamana-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <use href="assets/icons/sprite.svg#stories"></use>
</svg>
```

Use `../assets/...` on pages within `admin/` or `contributor/`. The sprite inherits `currentColor`; an SVG loaded in an `<img>` does not inherit the parent page's text colour in the same way. Icon-only actions still need an accessible label on the button or link.

## Responsive conventions

Start at 320px with stacked sections. Public and contributor layouts expand at 576/768px; desktop navigation and the admin sidebar appear at 992px. Wider review layouts start at 1200px. Management tables keep native semantics in focusable, labelled overflow regions rather than duplicating records.

The mobile navigation includes safe-area padding, and the page reserves space below its content. Do not hide body-level overflow to mask a layout bug.

## Accessibility and states

Keep labels and `aria-describedby` targets. Existing validation code fills the pre-created feedback nodes. Do not use `aria-invalid="true"` permanently on an otherwise valid field. Statuses retain explicit words, not colour alone. Maintain visible focus and the reduced-motion/forced-colours blocks.

Loading decorations are CSS-only and follow existing message classes. No new request, authentication, timing, or submission behavior belongs in this stylesheet.

## Asset integrity

Use record photographs for actual heritage content. The illustrated hero, community artwork, and missing-photo drawing are decorative; do not label them as documentary evidence of a real site. Keep all existing stored paths, image IDs and rendering hooks intact.
