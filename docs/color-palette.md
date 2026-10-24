# CampusFlow AI: colour palette and UI tokens

Version 2, 24 Oct 2026. The palette and design direction are the owner's (section 1, unchanged). Sections 2 to 5 add what the code needs: contrast rules, missing semantic colours and the token names. Contrast figures are WCAG 2.1 ratios, checked on 24 Oct 2026 (AA: 4.5:1 for normal text, 3:1 for large text and for UI parts such as borders, focus rings and indicators).

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

**Design direction:** professional, warm, student-friendly and recognisable. Light mode only in the MVP.

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
| `--secondary` | `#E8735A` | `--secondary-foreground` | `#2B2B2B` |
| `--accent` | `#F2B84B` | `--accent-foreground` | `#2B2B2B` |
| `--muted` | `#F1ECE3` | `--muted-foreground` | `#6B655B` |
| `--destructive` | `#B91C1C` | `--destructive-foreground` | `#FFFFFF` |
| `--border` | `#E5DED2` | `--input` | `#857E71` |
| `--ring` | `#0D4F4C` | | |
| `--sidebar` | `#0D4F4C` | `--sidebar-foreground` | `#FFFFFF` |
| `--sidebar-primary` (selected item) | `#F2B84B` | `--sidebar-primary-foreground` | `#2B2B2B` |
| `--success` (custom) | `#15803D` | `--info` (custom) | `#1D4ED8` |

Components use these tokens (`bg-primary`, `text-muted-foreground` and so on), never raw hex values. [Verify] the exact variable names and colour format (shadcn's current Tailwind v4 setup may expect OKLCH values) when shadcn/ui is installed in Slice 0; keep the colours above.

**Open (owner's choice, decisions.md §18):** whether secondary buttons stay coral fill with dark text (as above), or become teal outline with coral kept as the 10% accent for one signature action such as "Break this down".

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
