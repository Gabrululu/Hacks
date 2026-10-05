<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Package manager

Use pnpm for this project. Install with `pnpm install --frozen-lockfile`, run scripts with `pnpm <script>`, and invoke local tools with `pnpm exec <tool>`. Do not create npm or yarn lockfiles.

## Design system

Hacks' design identity is defined in `tinte.config.json`. Generated design guidance and the token API live in `design-system/hacks/`; regenerate them with `pnpm tinte:build` after changing the identity. Follow `design-system/hacks/design.md` when designing Hacks' own landing page and shared interface. Keep event landing themes customizable per event; never apply Hacks' own palette or typography to those event themes.

Run `pnpm tinte:lint` to check the fixed application entry points and shared UI components for hardcoded colors. Its scope deliberately excludes `src/styles.css`, which defines the canonical brand tokens, and event design/editor code, which supports organizer-controlled colors and fonts.
