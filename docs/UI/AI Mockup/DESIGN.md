---
name: KainBain Orchestrator
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#becaba'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#899486'
  outline-variant: '#3f4a3e'
  surface-tint: '#7bdb85'
  primary: '#7bdb85'
  on-primary: '#003911'
  primary-container: '#44a354'
  on-primary-container: '#00320e'
  inverse-primary: '#006e28'
  secondary: '#9acbff'
  on-secondary: '#003355'
  secondary-container: '#006caf'
  on-secondary-container: '#daeaff'
  tertiary: '#ffb77f'
  on-tertiary: '#4e2600'
  tertiary-container: '#d67920'
  on-tertiary-container: '#442000'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#97f89e'
  primary-fixed-dim: '#7bdb85'
  on-primary-fixed: '#002107'
  on-primary-fixed-variant: '#00531c'
  secondary-fixed: '#d0e4ff'
  secondary-fixed-dim: '#9acbff'
  on-secondary-fixed: '#001d34'
  on-secondary-fixed-variant: '#004a79'
  tertiary-fixed: '#ffdcc4'
  tertiary-fixed-dim: '#ffb77f'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6f3900'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
  surface-deep: '#0a0a0a'
  surface-subtle: '#1e1e1e'
  agent-fill: '#043b0c'
  human-fill: '#0d2b45'
  stage-fill: '#362600'
  error-red: '#ff8383'
  text-high: '#ededed'
  text-muted: '#6e757c'
  border-standard: '#333333'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '600'
    lineHeight: '1.4'
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.6'
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.5'
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.6'
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: '1.4'
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: 0.08em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  column-width: 280px
  gutter: 12px
  control-bar-height: 72px
---

## Brand & Style

The design system is engineered for **KainBain**, an AI automation platform that balances the cold precision of an IDE with the high-stakes visibility of a mission control center. The brand personality is **technical, authoritative, and operational**. It targets developers and automation engineers who need to distinguish instantly between autonomous agent activity and required human intervention.

The aesthetic follows a **Sophisticated Technical / Modern Corporate** hybrid:
- **Dark Mode Foundation:** Deep charcoal and black surfaces minimize eye strain during long orchestration sessions.
- **Role-Based Chromatics:** Vibrant greens signify agent autonomy, while deep blues signal human-centric tasks.
- **Utility-First:** Every element is optimized for information density and state clarity, utilizing a "Now Playing" paradigm for long-running background processes.
- **Tactile Precision:** Minimalist but with clear tonal layering to establish a hierarchy of control.

## Colors

The palette is strictly functional, mapping color to "ownership" of a task. 

- **Primary (Agent Green):** Reserved for autonomous success, agent-led stages, and automated triggers.
- **Secondary (Human Blue):** Used for manual interventions, active UI focus, and "Human-in-the-loop" requirements.
- **Tertiary (Stage Ochre):** Defines the structural skeleton of the workflow—stage headers, definitions, and environmental settings.
- **Neutral (Deep Charcoal):** The system operates on a baseline of `#121212`. Backgrounds use `#0a0a0a` to create "wells" for the Kanban board, while UI elements sit on `#1e1e1e`.

Status indicators follow a high-contrast pattern: `Error` uses a soft red to provide feedback without visual fatigue, while `Text High` ensures legibility against the dark canvas.

## Typography

This design system uses a dual-font strategy to separate UI narrative from technical data.

- **UI Interface (Hanken Grotesk):** A sharp, contemporary sans-serif used for all functional navigation, headers, and descriptive text. It provides a professional, "SaaS-grade" feel.
- **Technical Data (JetBrains Mono):** Used for UUIDs, prompt snippets, logs, and "Agent/Human" role badges. The monospaced nature emphasizes the programmatic essence of the platform.

**Scale Adjustments:**
- Use `display-lg` exclusively for main dashboard titles.
- `label-caps` is the primary style for small role indicators (e.g., "AGENT") to ensure they remain distinct at small sizes.
- `code-sm` is preferred for card metadata like timestamps and IDs.

## Layout & Spacing

The layout is designed as a **Fixed-Fluid Hybrid**:
- **The Sidebar/Header:** Fixed dimensions for core navigation.
- **The Kanban Board:** A horizontal-scrolling viewport with fixed-width columns (`280px`). This prevents task cards from becoming unreadable at high density.
- **The Global Control Bar:** A fixed-position "Now Playing" bar at the bottom of the viewport (`72px` height), anchored to provide persistent access to engine controls.

**Spacing Rhythm:**
A strict **4px/8px grid** is used. Padding within task cards is consistently `12px`, while the gutter between Kanban columns is `12px` to maximize the number of visible stages. Layout margins are `24px` on desktop and `16px` on tablet.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** and **Ghost Outlines** rather than heavy shadows.

1.  **Level 0 (Canvas):** `#0a0a0a` — The deepest layer, used for the background of the Kanban board area.
2.  **Level 1 (Containers):** `#121212` — Used for columns and the sidebar.
3.  **Level 2 (Cards/Floating):** `#1e1e1e` — Used for task cards and the Global Control Bar.
4.  **Interactivity:** Hover states on cards are indicated by a subtle `1px` border using the primary or secondary color (depending on task owner), creating a "glow" effect without using blurs.
5.  **Overlays:** Menus and modals use a higher tonal contrast with a `1px` border of `#333333` and a very slight ambient shadow (0px 4px 12px rgba(0,0,0,0.5)).

## Shapes

To maintain a "Dev Tool" aesthetic, the design system utilizes **Soft (0.25rem)** roundedness. 

- **Standard Elements:** Buttons, cards, and input fields use a `4px` radius.
- **Large Containers:** The project selector and global control bar may use `rounded-lg` (`8px`) for a slightly more approachable feel.
- **Status Pills:** Role indicators (Agent/Human) use a fully rounded "pill" shape to distinguish them from functional buttons.

## Components

**Task Cards (Kanban)**
- Cards must feature a role badge at the top right (Agent: Green / Human: Blue).
- Metadata (UUIDs) should be in `code-sm`.
- Active tasks get a left-hand border accent (3px) in the color of the current owner.

**Global Control Bar ("Now Playing")**
- Anchored to the bottom.
- Left section: "Current Engine State" with a pulsing status dot.
- Center section: Play/Pause/Skip controls using large `secondary` blue icons.
- Right section: Progress bar or "Stage 2 of 5" indicator.

**Buttons**
- **Primary:** Solid background (`primary` or `secondary`) with `#121212` text.
- **Ghost:** `1px` border of the respective color with transparent background.
- **Stage Action:** Small, ochre-bordered buttons used within stage headers (e.g., "Edit Stage").

**Inputs & Fields**
- Inputs use a dark fill (`#0a0a0a`) with a `1px` border of `#333333`.
- On focus, the border transitions to the `secondary` blue.
- Labels use `label-caps` for a structured, technical look.

**Kanban Stage Headers**
- Background fill of `stage-fill` (#362600).
- Thick bottom border of `tertiary` (#b86200).
- Contains a "Stage Label" and an "Owner Type" sub-label.