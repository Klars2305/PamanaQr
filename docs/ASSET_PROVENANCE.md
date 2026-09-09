# Pamana visual asset notes

## Created in this UI pass

| Asset | Purpose and provenance |
| --- | --- |
| `assets/logo/pamana-mark.svg` | Original botanical/arch-style vector emblem drawn for this implementation. Replaces the prior mark at the same path. |
| `assets/logo/pamana-logo.svg` | Full SVG wordmark with the existing "Our Heritage Lives On" tagline. Text uses local serif/sans-serif stacks. |
| `assets/icons/*.svg` | 54 individually maintained 24px line icons redrawn as one consistent family; 1.75px strokes and rounded ends. No third-party icon font. |
| `assets/icons/sprite.svg` | Same icon geometry collected into symbols for inheritable interface colour. Not an additional icon family. |
| `assets/illustrations/community-archive.svg` | Original vector still life: notebook, imagined keepsake photographs, and a botanical branch. These are illustrative shapes, not scans of historical records. |
| `assets/images/community-archive.webp` | Optimized 1200x950 raster export of the SVG master, used on contribution/auth/community surfaces. |
| `assets/illustrations/archive-placeholder.svg` | Generic illustrated missing-photo surface. It is not assigned to any database record or named real site. |
| `assets/illustrations/sun-motif.svg` | Optional lightweight brand decoration. |
| `assets/illustrations/cultural-divider.svg` | Optional restrained decorative divider. |
| `assets/images/pamana-hero-768.webp` | A 768x576 WebP derivative of the supplied hero, for smaller screens. |

## Reused / retained

`assets/images/pamana-hero.webp` was already supplied in the project and is reused as the home hero. It is a composite heritage-inspired illustration, not a documentary photograph or a geographically exact view. The supplied original PNG and existing decorative SVGs were retained rather than deleted or regenerated.

## Documentary images

Actual heritage and story photographs remain supplied by the existing Supabase records/storage. No Fort Santiago, Paoay, Vigan, Rizal Park, or other named-site photograph was fabricated or automatically substituted. No random external image hotlinks were introduced.

## Delivery and runtime

WebP is used for new raster exports; SVG is used for the logo, icons, and decorative sources. No base64 assets or external font files were added to the application. Some icons/optional decorations are included as a reusable library even when no current page uses them; they do not imply that new features exist.

## Asset sizes

- `assets/icons/sprite.svg`: 11,688 bytes
- `assets/icons/submitted.svg`: 244 bytes
- `assets/illustrations/archive-placeholder.svg`: 503 bytes
- `assets/illustrations/community-archive.svg`: 2,786 bytes
- `assets/illustrations/cultural-divider.svg`: 191 bytes
- `assets/illustrations/sun-motif.svg`: 231 bytes
- `assets/images/community-archive.webp`: 26,934 bytes
- `assets/images/pamana-hero-768.webp`: 125,850 bytes
- `assets/logo/pamana-logo.svg`: 792 bytes
- `assets/logo/pamana-mark.svg`: 460 bytes
