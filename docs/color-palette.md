# CampusFlow AI: colour palette and UI tokens

Version 3, 25 Oct 2026. The palette and design direction are the owner's (section 1, unchanged). Sections 2 to 5 add what the code needs: contrast rules, missing semantic colours and the token names. **Section 6 (new in v3) is the dark theme**, from the owner's dark palette. Contrast figures are WCAG 2.1 ratios, checked on 24 Oct 2026 (AA: 4.5:1 for normal text, 3:1 for large text and for UI parts such as borders, focus rings and indicators).

## 1. The palette (owner's choice)

| Element | Colour | Purpose |
|---|---|---|
| Sidebar and primary navigation | `#0D4F4C` (teal) | Brand identity |
| Main background | `#FAF7F2` (warm cream) | Visual breathing room |
| Primary buttons | `#0D4F4C` | Consistent, prominent actions |
| Secondary actions | `#E8735A` (coral) | Distinctive highlights |
| Reminders and selected indicators | `#F2B84B` (amber) | Draw attention |
| Cards and content surfaces | White `#FFFFFF` | Separate information cleanly |
| Main text | `#2B2B2B` | Readability |

**60-30-10 rule:** 60% background and neutrals, 30% primary (teal), 10% accents (coral, amber).

**Design inspiration:** traditional school classrooms, notebook pages, coloured chalk, pencils and colourful textbook covers.

**Design direction:** professional, warm, student-friendly and recognisable. Light and dark themes (section 6); the person chooses Light, Dark or System in the account menu or in Settings.

## 2. Contrast rules (must follow)

| Pair | Ratio | Rule |
|---|---|---|
| White text on teal | 9.38 | Use freely (sidebar, primary buttons) |
| `#2B2B2B` on cream / on white | 13.25 / 14.16 | Use freely |
| White text on coral `#E8735A` | 2.99 | **Never.** Coral buttons use `#2B2B2B` text (4.74) |
| Coral `#E8735A` as text or link on cream | 2.79 | **Never.** Use coral-strong `#B4452F` (5.13) |
| White text on amber `#F2B84B` | 1.79 | **Never.** Amber always carries `#2B2B2B` text (7.91) |
| Amber as an indicator on cream | 1.67 | **Not alone.** Pair it with an amber-strong `#8A5A00` edge or icon (5.55), or use it only on the teal sidebar (5.24) |
| White cards on cream | 1.07 | Cards need a border (`--border`) or a soft shadow |
| Status colours | | Never use colour alone: always add a word or an icon |

## 3. Added colours

| Name | Hex | Use | Contrast |
|---|---|---|---|
| coral-strong | `#B4452F` | Coral text and links; coral button with white text if ever needed | 5.13 on cream, 5.48 with white text |
| amber-strong | `#8A5A00` | Amber text, the edge or icon of an amber indicator | 5.55 on cream |
| amber-soft | `#FEF3C7` | Reminder banner background (with `#2B2B2B` text) | text 12.72 |
| teal-soft | `#E6F0EF` | Selected row, hover on light surfaces | text 12.19 |
| danger | `#B91C1C` | Errors, destructive buttons (white text) | 6.05 on cream, 6.47 with white text |
| success | `#15803D` | Done, success messages | 4.69 on cream |
| info | `#1D4ED8` | Information notes | 6.27 on cream |
| muted-text | `#6B655B` | Secondary text, help text, timestamps | 5.40 on cream |
| border | `#E5DED2` | Card and divider lines (decorative) | 1.25 (decorative only) |
| input-border | `#857E71` | Text field and checkbox outlines (must be visible) | 3.76 on cream |
| focus ring | `#0D4F4C` | 2 px outline with 2 px offset on every focusable element | 8.77 on cream |

Danger is a true red, so "secondary action" (coral) and "danger" never look alike.

## 4. Tokens (shadcn CSS variables in `src/app/globals.css`)

| Token | Value | Foreground token | Value |
|---|---|---|---|
| `--background` | `#FAF7F2` | `--foreground` | `#2B2B2B` |
| `--card`, `--popover` | `#FFFFFF` | `--card-foreground` | `#2B2B2B` |
| `--primary` | `#0D4F4C` | `--primary-foreground` | `#FFFFFF` |
| `--secondary` (the coral accent colour) | `#E8735A` | `--secondary-foreground` | `#2B2B2B` |
| `--accent` | `#F2B84B` | `--accent-foreground` | `#2B2B2B` |
| `--muted` | `#F1ECE3` | `--muted-foreground` | `#6B655B` |
| `--destructive` | `#B91C1C` | `--destructive-foreground` | `#FFFFFF` |
| `--border` | `#E5DED2` | `--input` | `#857E71` |
| `--ring` | `#0D4F4C` | | |
| `--sidebar` | `#0D4F4C` | `--sidebar-foreground` | `#FFFFFF` |
| `--sidebar-primary` (selected item) | `#F2B84B` | `--sidebar-primary-foreground` | `#2B2B2B` |
| `--success` (custom) | `#15803D` | `--info` (custom) | `#1D4ED8` |

Components use these tokens (`bg-primary`, `text-muted-foreground` and so on), never raw hex values. [Verify] the exact variable names and colour format (shadcn's current Tailwind v4 setup may expect OKLCH values) when shadcn/ui is installed in Slice 0; keep the colours above.

**Secondary buttons are teal outline** (owner's decision, 26 Oct 2026, `decisions.md` §19): the `secondary` button variant is transparent with a `--brand` border and `--brand` text (teal in light mode, the light teal in dark mode), and `teal-soft` on hover. The `--secondary` coral token stays the 10% accent: logo dots, and one signature action, the "Break this down" AI button in Slice 4. Primary actions (Start, Mark done, Save) stay solid teal.

## 5. Task states and charts

| State | Look |
|---|---|
| To Do | `muted` background, `#2B2B2B` text, "To Do" label |
| In progress | `teal-soft` background, teal text, "In progress" label |
| Done | `success` text and a check icon, "Done" label |
| Overdue | `danger` text and a clock icon, "Overdue" label |
| Late (submission) | `amber-soft` background, `amber-strong` text, "Late" label |
| Simulated data banner | `amber-soft` background, `#2B2B2B` text |

**Chart series** (Growth Tracker, class tracker): 1 teal `#0D4F4C`, 2 coral-strong `#B4452F`, 3 amber-strong `#8A5A00`. Each one is at least 3:1 on cream. Always label lines and bars directly or with a legend, so colour is never the only cue. Gridlines use `--border`.

## 6. Dark theme (new in v3)

**The owner's dark palette** (25 Oct 2026):

| UI element | Colour name | Hex | Token |
|---|---|---|---|
| Main background | Midnight Blackboard | `#121F1E` | `--background` |
| Sidebar and navigation | Deep Teal | `#163B39` | `--sidebar` |
| Primary buttons | Signature Teal | `#0D4F4C` | `--primary` |
| Cards, dropdowns, modals | Slate Teal | `#203331` | `--card`, `--popover` |
| Primary text | Warm Chalk | `#FAF7F2` | `--foreground` |
| Secondary text | Muted Sage | `#B7C7C2` | `--muted-foreground` |
| Coral accent, secondary actions | Soft Coral | `#F0806A` | `--secondary` |
| Amber accent, reminders | Chalk Amber | `#F2B84B` | `--accent` |
| Borders and dividers | Muted Teal | `#36514D` | `--border` |
| Disabled elements | Muted Grey | `#71817C` | `--disabled` |

**Colours derived for the dark theme** (the palette did not cover them; each is checked, see below):

| Token | Hex | Why |
|---|---|---|
| `--brand` | `#5CC4B8` | Teal for headings, links and selected filters. The Signature Teal is too dark to read on `#121F1E` (about 1.8:1), so text uses a lighter teal from the logo's own dark version. `--brand` is `#0D4F4C` in the light theme |
| `--ring` | `#5CC4B8` | Focus ring, 8.1:1 on the background |
| `--input` | `#668781` | Text field outlines. `#36514D` (the border colour) is only 1.97:1 on the background, and outlines of controls need 3:1, as in the light theme. Cards and dividers still use `--border` |
| `--muted` | `#1A2A28` | A quiet surface between the background and a card |
| `--destructive` | `#F87171` | Error text and destructive buttons; a true red, so it stays different from coral |
| `--success` | `#5BD38A` | Done and success messages |
| `--info` | `#8AB4FF` | Information notes |
| `--coral-strong`, `--amber-strong` | `#F0806A`, `#F2B84B` | Coral and amber used as text or edges (the "strong" versions are needed only on light surfaces) |
| `--amber-soft` | `#3A2E10` | Reminder and "Late" background, with amber text (7.4:1) |
| `--teal-soft` | `#1E3A38` | Selected row or filter |
| `--brand-panel` | `#0C3B3E` (dark), `#F8F4EA` (light) | Background of the logo panel on the sign-in and sign-up pages, sampled from the logo file so the picture blends in |
| Chart series | `#5CC4B8`, `#F0806A`, `#F2B84B` | Teal, coral, amber; each at least 3:1 on `#121F1E` |
| Sidebar selected item | `#F2B84B` with `#121F1E` text | Same idea as the light theme |

**Rules that carry over:** the contrast rules in section 2 apply to both themes (text 4.5:1, controls 3:1, never colour alone). In dark mode the coral and amber buttons keep dark text (`#121F1E`), the primary button keeps light text (`#FAF7F2` on `#0D4F4C`, 8.8:1).

**Checked, not assumed:** `tests/unit/theme-contrast.test.ts` reads `src/app/globals.css` and checks 25 text pairs (4.5:1) and 9 control pairs (3:1) in **both** themes, so a colour change that breaks contrast fails the tests. It also pins the owner's ten dark colours.

**How the theme is chosen:** a browser cookie `theme` (`system`, `light` or `dark`; default `system`). The server reads it to set the `dark` class on `<html>`; a tiny script in `<head>` sets the class before the page paints for the `system` choice, so there is no light flash. The choice is saved per browser, not per account.

**Logos:** the logo is vector. `public/brand/mark-light.svg` and `public/brand/mark-dark.svg` are the cap, swirl, star, road and book, traced from the owner's dual-theme artwork (flat teal, coral, amber and peach shapes, transparent background, about 35 KB and 22 KB), with a light and a dark colourway that swap with the theme. The name "Campus-Flow AI" and the tagline "Plan, Do, Grow" are real text in Poppins next to the mark, so they stay sharp and match the app. `src/app/icon.svg` (the dark mark on a rounded dark-teal square) is the browser icon, and the small tile in the sidebar and on cards uses the same dark mark on `--brand-chip`. The original artwork is kept in `design/brand-source/` (not served). The owner's earlier SVG redraws were removed: the wordmark overlapped the book, and an SVG shown as an image cannot use the page's font.
