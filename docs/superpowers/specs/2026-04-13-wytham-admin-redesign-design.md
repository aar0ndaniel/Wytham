# Wytham Admin Redesign

Date: 2026-04-13

## Scope

Redesign the current admin login and admin dashboard inside `backend/server.js` before the online Railway deployment work.

This spec covers:

- the visual redesign of the admin login
- the structural redesign of the admin dashboard
- brand alignment with the current Wytham landing page and brand foundation
- information hierarchy, spacing, and interaction rules

This spec does not yet cover:

- the final public deployment configuration on Railway
- the `/wythamPLS` public routing changes
- the hidden admin route implementation for `/wythamPLS/tarkitey`

Those routing and hosting changes should be handled after the admin redesign is approved and implemented.

## Objective

Turn the current admin into a minimal, high-quality Wytham control surface that feels calm, premium, and deliberate.

The redesign should remove the heavier "dashboard" feel of the existing admin and replace it with:

- a dark, minimal, image-inspired login experience
- a left-sidebar layout with strong spacing discipline
- fewer cards and less explanatory copy
- a table-first admin surface that feels clean rather than busy

## Brand Direction

The redesign should follow the approved Wytham brand language already visible in the landing page and documented in `C:\Users\aaron\dev\brand guideline and marketing\2026-04-08-wytham-brand-foundation-v1.md`.

The key tone targets are:

- restrained
- literate
- research-grade
- calm
- warm, but not decorative

### Core Colors

- `#181818` as the primary background
- `#F5F1E7` as primary text
- `#C8C1AE` as secondary text
- `#AAB68A` as soft positive emphasis
- `#87976B` as the main structural accent for active states and selected navigation
- `#C6A24B` as the primary accent for important actions only
- `#D3B85F` as a brighter gold highlight used sparingly

### Color Rules

- do not use bright accent colors everywhere
- use moss tones for trust, state, and structure
- use gold only for key emphasis such as the primary submit action
- keep the interface mostly dark and neutral
- avoid neon or highly saturated visual treatment

## Design Principles

### 1. Minimal Means Fewer Blocks, Not Tighter Spacing

The admin should feel open and controlled, not cramped. Every screen element should have deliberate padding and breathing room.

### 2. Table-First, Not Card-First

The dashboard should be organized around usable data views rather than a stack of promotional metric cards.

### 3. Quiet Hierarchy

The UI should rely on spacing, typography, alignment, and thin dividers more than heavy boxes or decorative framing.

### 4. Consistent Surface Language

Buttons, fields, panels, tables, notices, and modals should share a unified spacing and border system so the admin feels designed as one product.

## Login Experience

### Visual Reference

The login should take visual cues from the supplied reference image:

- dark background
- soft spotlight or beam effect from the upper corner
- centered glass-like login panel
- very little text
- minimal controls

The result should not copy the reference literally. It should reinterpret that feeling using Wytham colors and typography.

### Layout

The login page should contain:

- a dark full-screen background
- a subtle, blurred light beam in the upper area
- a centered translucent login shell
- Wytham mark or logo at the top
- a small title: `Sign in`
- a compact subtitle
- username or email input
- password input
- one primary sign-in button
- one compact inline error area

### Content Rules

- no social login
- no sign-up links
- no extra helper links unless already needed for the backend flow
- no unnecessary explanatory copy

### Styling Rules

- use a glass or frosted surface for the panel
- use soft blur and restrained edge highlights
- use generous internal padding
- keep the panel narrow and vertically balanced
- inputs should feel quiet and elegant, not heavy
- the primary button should use Wattle Gold with readable dark text

## Dashboard Structure

### Overall Layout

The post-login dashboard should use a left sidebar layout.

Structure:

- fixed or sticky left sidebar for navigation
- main content area to the right
- slim top header inside the main content area
- minimal metrics strip near the top
- main data view below

### Sidebar

The sidebar should contain:

- Wytham admin brand label
- `Signups`
- `Donations`
- `Account`
- compact utility links for `Export CSV` and `Email preview`, separated from the primary navigation items

Sidebar rules:

- clear icon and label pairing
- strong active state using moss accent
- generous button padding
- no crowded icon rail
- the active item should feel obvious without looking loud

### Main Header

The main header should be minimal and functional:

- product label such as `Wytham admin`
- short page title based on the active view
- one or two actions on the right at most

The header should not include a hero section or long descriptive text.

## Dashboard Screens

### Signups Screen

This is the default screen.

The screen should include:

- one very compact metrics row
- one primary signups table

The metrics row should not be oversized and should only summarize the most useful values, such as:

- total signups
- lite count
- bundle count
- open rate

These should feel like compact summary items rather than large feature cards.

The signups table should remain the visual focus.

Table expectations:

- comfortable row height
- clean column spacing
- visible but subtle dividers
- readable badges for edition and email status
- action buttons with enough padding to avoid visual noise

### Donations Screen

The donations screen should use the same visual system as signups, but it should be even lighter:

- minimal heading
- no large metrics row
- one clean donations table

The purpose is readability, not decoration.

### Account Screen

The account screen should remain available from the sidebar but be visually quieter than the current version.

Use:

- simple grouped settings sections
- sparse copy
- consistent spacing

## Components and UI Rules

### Buttons

Every button should have balanced padding and a clear hierarchy.

- primary buttons use Wattle Gold
- secondary buttons use dark surfaces with moss or neutral borders
- danger actions should be clear but not visually dominant until needed

### Panels and Surfaces

- avoid bulky boxed cards wherever possible
- where grouping is needed, prefer thin borders, subtle tint shifts, or sectional spacing
- if a boxed surface is necessary, it should be quiet and low-contrast

### Modals

Any modal should inherit the same visual language as the login:

- dark or glassy overlay treatment
- careful padding
- restrained border and shadow treatment
- short copy
- clear action grouping

### Tables

Tables are first-class UI here.

Rules:

- prioritize legibility over density
- preserve enough horizontal padding in cells
- keep row actions aligned and easy to scan
- status pills should be subtle and brand-aligned

### Notices and Alerts

- keep notices short
- avoid large banners with too much copy
- use moss for positive states, muted neutrals for information, and restrained red for destructive warnings

## Typography

The interface should feel closer to the landing page and brand tone than the current admin variants.

Guidance:

- strong but not loud headings
- readable small labels
- muted supporting copy
- avoid overly technical or terminal-like personality unless functionally necessary

## Copy Rules

- replace older `Semora` admin naming with `Wytham`
- keep headings short
- remove marketing-style paragraphs from the admin
- prefer labels, counts, and direct actions over descriptive blocks

## Interaction Expectations

- the left sidebar controls the active panel cleanly
- active states should be obvious and consistent
- bulk delete and destructive flows should still work
- export and email preview links should remain accessible if still part of the workflow
- keyboard focus states must remain visible

## Implementation Notes

The redesign will involve replacing the currently embedded admin HTML and CSS returned by:

- `renderAdminPage(...)`
- `renderAdminLoginPage(...)`
- `renderAdminAccountPanel()`

The implementation should also remove or replace remaining older admin branding strings that still say `Semora`.

## Acceptance Criteria

The redesign is complete when:

- the login page matches the approved glass-inspired dark direction
- the login uses Wytham colors instead of the current older admin palette
- the admin uses a left sidebar navigation
- the dashboard feels minimal and no longer card-heavy
- the signups view is the main focus
- buttons, tables, modals, and grouped surfaces show deliberate spacing and padding
- older `Semora` admin wording is removed from the main admin flow
- the result feels visually consistent with the Wytham landing page and brand foundation

## Open Follow-Up Work

After this redesign is implemented and verified, the next spec or plan should cover:

- Railway deployment setup
- persistent SQLite storage on Railway
- path-based public routing for `/wythamPLS`
- hidden admin routing for `/wythamPLS/tarkitey`
