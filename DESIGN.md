---
version: alpha
name: vLLM-Launcher-design
description: |
  A clean white-themed developer tool for launching and monitoring vLLM inference servers. White canvas (#ffffff), black primary (#000000), subtle gray hairline borders (#e5e5e5), Inter + JetBrains Mono typography. Inspired by Ollama's minimal aesthetic — bright, data-dense, and distraction-free.

colors:
  primary: "#000000"
  primary-soft: "#171717"
  primary-deep: "#0a0a0a"
  primary-glow: "rgba(0, 0, 0, 0.04)"
  primary-glow-strong: "rgba(0, 0, 0, 0.08)"
  on-primary: "#ffffff"
  ink: "#000000"
  ink-strong: "#000000"
  body: "#525252"
  mute: "#a3a3a3"
  canvas: "#ffffff"
  canvas-soft: "#fafafa"
  canvas-softer: "#f5f5f5"
  surface-card: "#ffffff"
  surface-hover: "#fafafa"
  hairline: "#e5e5e5"
  hairline-soft: "#d4d4d4"
  error: "#ef4444"
  error-soft: "rgba(239, 68, 68, 0.08)"
  warning: "#f59e0b"
  warning-soft: "rgba(245, 158, 11, 0.08)"
  success: "#10b981"
  success-soft: "rgba(16, 185, 129, 0.08)"
  info: "#3b82f6"
  info-soft: "rgba(59, 130, 246, 0.08)"

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
    borderRadius: "{rounded.lg}"
    padding: "{spacing.2xl}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    borderRadius: "{rounded.full}"
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
    backgroundColor: "{colors.canvas}"
    borderColor: "{colors.hairline}"
    textColor: "{colors.ink}"
    borderRadius: "{rounded.sm}"
    padding: "{spacing.sm} {spacing.md}"
  input-focused:
    borderColor: "{colors.primary}"
    boxShadow: "0 0 0 2px {colors.primary-glow}"
  badge-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    borderRadius: "{rounded.full}"
  badge-error:
    backgroundColor: "{colors.error-soft}"
    textColor: "{colors.error}"
    borderRadius: "{rounded.full}"
  sidebar:
    backgroundColor: "{colors.canvas}"
    borderColor: "{colors.hairline}"
    width: "240px"
  sidebar-collapsed:
    width: "64px"
  gauge:
    strokeWidth: 10
    radius: 80
    trackColor: "{colors.canvas-softer}"
    valueColor: "{colors.primary}"
  log-viewer:
    backgroundColor: "{colors.canvas-softer}"
    fontFamily: "{typography.font-mono}"
    fontSize: "12px"
---

## Overview

vLLM Launcher is a developer tool for launching, monitoring, and managing vLLM inference servers. The design follows Ollama's minimal white aesthetic: a bright canvas with subtle gray borders, black primary accent for all CTAs and active states, and clean typographic hierarchy.

The interface is data-dense by nature — throughput gauges, real-time log streams, GPU utilization bars — but structured with generous whitespace between cards and clear typographic hierarchy. Every interactive element uses hairline borders on the white canvas; depth comes from subtle background tints and spacing, not shadows.

**Key Characteristics:**
- White `{colors.canvas}` (#ffffff) end-to-end — the entire app is one continuous bright surface
- Black `{colors.primary}` (#000000) accent for all CTAs, active states, and emphasis
- Hairline-bordered cards (`{colors.hairline}` #e5e5e5) — no shadows, no gradients
- Inter for all UI text; JetBrains Mono for code, metrics, and technical labels
- Smooth spring animations via Framer Motion for gauge needles, page transitions, and status indicators
- Log viewer styled with muted background (#f5f5f5) with color-coded severity levels
- SVG arc gauges with spring animation for throughput visualization

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
| Page background | canvas | #ffffff |
| Card surface | surface-card | #ffffff |
| Primary CTA / Active | primary | #000000 |
| Headlines | ink | #000000 |
| Body text | body | #525252 |
| Captions / Muted | mute | #a3a3a3 |
| Card borders | hairline | #e5e5e5 |
| Hover background | surface-hover | #fafafa |
| Subtle background | canvas-softer | #f5f5f5 |
| Error state | error | #ef4444 |
| Warning state | warning | #f59e0b |
| Success state | success | #10b981 |
| Info state | info | #3b82f6 |

## Animation

- Page transitions: fade + slide (y: 8px → 0, 250ms)
- Gauge values: spring physics (stiffness: 80, damping: 20)
- Status badge pulse: 2s ease-in-out infinite
- Log lines: fade-in (100ms)
- Cards: hover border-color transition (200ms)
- Sidebar: width animation (200ms ease)
- GPU bar: width transition (500ms ease-out)
