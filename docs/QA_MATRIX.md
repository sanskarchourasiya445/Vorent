# Dual-Theme Browser QA Matrix & Responsive Audit

**Document Version:** 4.1.0  
**Audit Date:** October 25, 2026  
**Auditor:** Warrant Engineering Assurance / Antigravity Agent  
**Scope:** 4 Core Screens × 2 Themes × 2 Viewports (16 verification points) + 2 Boundary Checks on Checkout Gate.

---

## 1. Visual Specification & Color Tokens

Warrant Studio enforces a high-contrast cyber-finance institutional design system conforming to WCAG AA accessibility standards.

| Token Role | Dark Theme (Midnight Navy) | Light Theme (Warm Ivory) | Contrast Ratio |
|---|---|---|---|
| **Canvas Background** | `#0B1220` (Midnight Navy) | `#F7F5EF` (Warm Ivory) | Base surface |
| **Primary Ink** | `#F8FAFC` (Slate 50) | `#12372A` (Forest Green Deep) | > 12:1 (Passes AAA) |
| **Muted Ink** | `#94A3B8` (Slate 400) | `#475569` (Slate 600) | > 4.8:1 (Passes AA) |
| **Accent / Brand** | `#10B981` (Emerald 500) | `#12372A` (Forest Green) | > 4.5:1 (Passes AA) |
| **Border / Chrome** | `#1E293B` (Slate 800) | `#E2E8F0` (Slate 200) | Structural |
| **ALLOW Status** | `#10B981` (Emerald) | `#047857` (Emerald 700) | > 4.5:1 (Passes AA) |
| **DENY Status** | `#EF4444` (Red 500) | `#B91C1C` (Red 700) | > 4.5:1 (Passes AA) |
| **REVIEW Status** | `#F59E0B` (Amber 500) | `#B45309` (Amber 700) | > 4.5:1 (Passes AA) |

---

## 2. Core Matrix Verification Points (16 Verification Points)

### 2.1 Overview (System Dashboard)
- **Desktop (1280×800):**
  - **Dark Mode:** Status ribbon, KPI metric cards, policy posture chart, and quick action cards render with zero overflow. CSS flexbox/grid maintains balance.
  - **Light Mode:** Warm Ivory surface palette maintains contrast. Typography sharp with `#12372A` headings and `#475569` descriptions.
- **Mobile (375×667):**
  - **Dark Mode:** Metrics stack vertically in single column. Zero horizontal scrollbar. Mobile hamburger drawer opens smoothly via GPU translate.
  - **Light Mode:** Full contrast maintained on mobile header bar, touch targets adhere to $\ge 44\times 44$px requirement.

### 2.2 Mandate (Mandate Compiler & Policy Editor)
- **Desktop (1280×800):**
  - **Dark Mode:** Split-pane editor (natural language prompt on left, AST candidate rules and RFC 8785 SHA-256 hash preview on right). Gemini AI assistant banner renders cleanly.
  - **Light Mode:** High-contrast rule chips, unambiguous diff display, and explicit "Sign and Commit Policy Version" button.
- **Mobile (375×667):**
  - **Dark Mode:** Editor and AST rules stack cleanly. Action button fixed with full touch target width.
  - **Light Mode:** Prompt input and candidate cards avoid text truncation clipping.

### 2.3 Approval (Approval Checkpoints & Governance Locks)
- **Desktop (1280×800):**
  - **Dark Mode:** Ledger table with qualifying test run links, RFC 8785 SHA-256 hashes, spend limits, and Decision D-014 fail-closed banner.
  - **Light Mode:** Status badges (`ACTIVE`, `EXPIRED`, `REVOKED`) render with AAA contrast against warm surface.
- **Mobile (375×667):**
  - **Dark Mode:** Horizontal scroll container on table includes `data-lenis-prevent` to prevent scroll hijacking. Card view gracefully wraps metadata.
  - **Light Mode:** Badges and spend limits remain distinct without text wrapping bugs.

### 2.4 Checkout Gate (Checkout Gate & 4-Stage Pipeline)
- **Desktop (1280×800):**
  - **Dark Mode:** Two-column workstation: cart manifest & one-click tamper attack buttons on left; Decision card and 4-stage PayPal Orders v2 execution pipeline on right.
  - **Light Mode:** Clean borders, prominent "Zero PayPal Orders Created" callout on `DENY` evaluations.
- **Mobile (375×667):**
  - **Dark Mode:** Stacks cart proposal above gate decision card. Tamper buttons stack vertically with full finger touch targets.
  - **Light Mode:** Decision badge (`ALLOW` / `DENY` / `REVIEW`) visible above the fold on proposal evaluation.

---

## 3. Boundary Checks (Checkout Gate)

### 3.1 Extreme Narrow Mobile Boundary Check (320×568 — iPhone SE 1st Gen)
- **Horizontal Overflow:** Strict `0px` horizontal overflow. Verified via `overflow-x-hidden` on parent layout and `min-w-0` on container.
- **Truncation Behavior:** Hash badges dynamically truncate to `8...4` prefix/suffix, preventing overflow.
- **Touch Target Fidelity:** All buttons, including tamper attack presets, maintain $\ge 44$px height with accessible focus rings.
- **Text Blowout:** Zero label clipping; font sizes scale down gracefully using `text-xs` / `text-[11px]`.

### 3.2 Wide Desktop Boundary Check (1440×900 & 1680px Ultrawide)
- **Maximum Width Constraint:** Center workstation container enforces `max-w-[1680px] mx-auto` to prevent excessive line lengths on wide displays.
- **Sidebar Alignment:** Collapsible rail transitions smoothly between `w-64` (expanded) and `w-16` (collapsed) using `transition-[width] duration-200 ease-in-out`.
- **Keyboard Shortcut:** `Ctrl+B` / `Cmd+B` toggles sidebar instantaneously without layout jitter or horizontal scrollbar artifacting.

---

## 4. Screenshot Invalidation Notice

Existing legacy screenshots in `docs/screenshots/dual-theme/` (files `01_dark_...` through `17_light_...`) were captured prior to the implementation of the WS1 collapsible sidebar rail and WS3 tamper attack presets. They are preserved for audit lineage, but are officially superseded by the current implementation validated in this matrix.
