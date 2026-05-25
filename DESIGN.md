---
version: alpha
name: vLLM-Launcher-design
description: |
  A dark-themed developer tool for launching and monitoring vLLM inference servers. Near-black canvas (#101010), electric-green accent (#00d992), hairline-bordered cards, Inter + JetBrains Mono typography. Inspired by VoltAgent's design language — terminal-native, data-dense, engineered for precision.

colors:
  primary: "#00d992"
  primary-soft: "#2fd6a1"
  primary-deep: "#10b981"
  primary-glow: "rgba(0, 217, 146, 0.15)"
  on-primary: "#101010"
  ink: "#f2f2f2"
  ink-strong: "#ffffff"
  body: "#bdbdbd"
  mute: "#8b949e"
  canvas: "#101010"
  canvas-soft: "#1a1a1a"
  canvas-softer: "#141414"
  surface-card: "#181818"
  surface-hover: "#1f1f1f"
  hairline: "#2a2a2a"
  hairline-soft: "#222222"
  error: "#ef4444"
  error-soft: "rgba(239, 68, 68, 0.15)"
  warning: "#f59e0b"
  warning-soft: "rgba(245, 158, 11, 0.15)"
  success: "#00d992"
  success-soft: "rgba(0, 217, 146, 0.1)"
  info: "#3b82f6"
  info-soft: "rgba(59, 130, 246, 0.15)"

typography:
  font-sans: "Inter, system-ui, -apple-system, sans-serif"
  font-mono: "JetBrains Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
  display-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.5px
  display-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
  heading:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  caption-upper:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.5px
    textTransform: uppercase
  code:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.6
  code-lg:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  metric:
    fontFamily: JetBrains Mono
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: -1px

rounded:
  sm: 6px
  md: 8px
  lg: 12px
  full: 9999px

spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  2xl: 24px
  3xl: 32px
  4xl: 40px
  5xl: 48px

components:
  card:
    backgroundColor: "{colors.surface-card}"
    borderColor: "{colors.hairline}"
    borderRadius: "{rounded.md}"
    padding: "{spacing.2xl}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    borderRadius: "{rounded.sm}"
    padding: "{spacing.sm} {spacing.lg}"
  button-danger:
    backgroundColor: "{colors.error}"
    textColor: "#ffffff"
    borderRadius: "{rounded.sm}"
    padding: "{spacing.sm} {spacing.lg}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.body}"
    borderColor: "{colors.hairline}"
    borderRadius: "{rounded.sm}"
  input:
    backgroundColor: "{colors.canvas-soft}"
    borderColor: "{colors.hairline}"
    textColor: "{colors.ink}"
    borderRadius: "{rounded.sm}"
    padding: "{spacing.sm} {spacing.md}"
  input-focused:
    borderColor: "{colors.primary}"
    boxShadow: "0 0 0 2px {colors.primary-glow}"
  badge-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.primary}"
    borderRadius: "{rounded.full}"
  badge-error:
    backgroundColor: "{colors.error-soft}"
    textColor: "{colors.error}"
    borderRadius: "{rounded.full}"
  sidebar:
    backgroundColor: "{colors.canvas-softer}"
    borderColor: "{colors.hairline}"
    width: "240px"
  sidebar-collapsed:
    width: "64px"
  gauge:
    strokeWidth: 10
    radius: 80
    trackColor: "{colors.hairline}"
    valueColor: "{colors.primary}"
  log-viewer:
    backgroundColor: "#0d0d0d"
    fontFamily: "{typography.font-mono}"
    fontSize: "12px"
---

## Overview

vLLM Launcher is a developer tool for launching, monitoring, and managing vLLM inference servers. The design follows VoltAgent's philosophy: a near-black canvas that reads like polished terminal output, with a single electric-green accent carrying every CTA, status indicator, and metric highlight.

The interface is data-dense by nature — throughput gauges, real-time log streams, GPU utilization bars — but structured with generous whitespace between cards and clear typographic hierarchy to avoid visual fatigue. Every interactive element uses hairline borders on the dark canvas; depth comes from color contrast, not shadows.

**Key Characteristics:**
- Near-black `{colors.canvas}` (#101010) end-to-end — the entire app is one continuous dark surface
- Single electric-green `{colors.primary}` (#00d992) accent for all CTAs, active states, and positive metrics
- Hairline-bordered cards (`{colors.hairline}` #2a2a2a) — no shadows, no gradients
- Inter for all UI text; JetBrains Mono for code, metrics, and technical labels
- Smooth spring animations via Framer Motion for gauge needles, page transitions, and status indicators
- Log viewer styled as a terminal (#0d0d0d background) with color-coded severity levels
- SVG arc gauges with gradient glow effects for throughput visualization

## Layout

### Spacing System
- Base unit: 4px
- Section gaps: 24–32px
- Card internal padding: 24px
- Component gaps: 8–12px

### Grid
- Dashboard: 3-column metric grid (2 gauges + 1 info card)
- Full-width chart and GPU utilization bar below
- Sidebar: fixed 240px (collapsible to 64px)
- Main content: fluid with 32px padding

### Responsive
- Below 900px: metric grid collapses to 1 column
- Sidebar collapses on mobile

## Color Usage

| Role | Token | Hex |
|------|-------|-----|
| Page background | canvas | #101010 |
| Card surface | surface-card | #181818 |
| Primary CTA / Active | primary | #00d992 |
| Headlines | ink | #f2f2f2 |
| Body text | body | #bdbdbd |
| Captions / Muted | mute | #8b949e |
| Card borders | hairline | #2a2a2a |
| Error state | error | #ef4444 |
| Warning state | warning | #f59e0b |
| Info / Decode metric | info | #3b82f6 |

## Animation

- Page transitions: fade + slide (y: 8px → 0, 250ms)
- Gauge values: spring physics (stiffness: 80, damping: 20)
- Status badge pulse: 2s ease-in-out infinite
- Log lines: fade-in (100ms)
- Cards: hover border-color transition (200ms)
- Sidebar: width animation (200ms ease)
- GPU bar: width transition (500ms ease-out)
