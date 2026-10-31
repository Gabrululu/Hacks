# Hacks

Hacks is a platform for creating and running hackathons. Organizers can build event pages, manage registrations and teams, coordinate mentors and judges, review projects, and publish results. Participants use one account to join events and collaborate with their teams.

The platform is built with React, TypeScript, Vite, and Convex. Stellar wallets are used for sign-in.

## Getting started

Requirements: Node.js and pnpm (the project pins its pnpm version in `package.json`).

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Start Convex in the first terminal and wait for it to finish starting:

```bash
pnpm convex:dev
```

In a second terminal, configure local wallet authentication and start the web app:

```bash
pnpm auth:setup:local
pnpm dev
```

Open the local URL printed by Vite.

The setup script is intended for the local Convex development deployment. Do not use it to configure a hosted deployment.

## Configuration

Set the client-side Convex URLs in `.env.local`:

- `VITE_CONVEX_URL` — Convex deployment URL.
- `VITE_CONVEX_SITE_URL` — Convex HTTP actions URL, used for uploads and downloads.
- `VITE_DEMO_MODE` — set to `true` to include clearly marked sample events.

Server-only credentials belong in the Convex deployment environment, never in `VITE_` variables or committed files. Use `.env.example` as the local configuration reference. Email delivery through Resend and production wallet authentication require separately configured provider credentials and domains.

## Development commands

```bash
pnpm build       # Type-check and create a production build
pnpm test        # Run automated tests
pnpm lint        # Lint Convex backend code
pnpm test:e2e    # Run browser tests (local services required)
```

## Privacy

Event pages expose information published by their organizers. Participant profiles, registrations, team workspaces, judging data, and uploaded files are scoped to the relevant account, team, event role, or explicit publication settings. Project galleries are public only when organizers enable them and publish results.

Keep local environment files, signing keys, API tokens, and private deployment configuration out of version control. `SPEC.md` contains internal planning material and is intentionally ignored by Git.

## Deployment

The backend runs on Convex and the frontend on a Cloudflare Worker with static assets (`wrangler.jsonc`). The Worker serves the SPA, renders `/api/og` share images and returns event previews to social crawlers on `/`, `/e/*` and event subdomains.

1. Link the project to a Convex account (`pnpm exec convex login`, then `pnpm convex:dev` to create the cloud project) and log in to Cloudflare (`pnpm exec wrangler login`).
2. Create `.env.production.local` with the production `VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL`, `VITE_WALLETCONNECT_PROJECT_ID` and `VITE_DEMO_MODE=false`. It overrides `.env.local` in production builds.
3. Run `pnpm auth:setup:prod` once to generate the production signing keys on Convex. Set the remaining server variables (`SUPERADMIN_WALLETS`, `APP_URL`, Resend settings) with `pnpm exec convex env set --prod <NAME>`, piping secret values through stdin.
4. In Cloudflare DNS for `mintedinpe.com`, add a proxied wildcard record for `*.hacks` so event subdomains reach the Worker. `hacks.mintedinpe.com` is attached as a custom domain on deploy.
5. Run `pnpm deploy:prod`. It validates the production URLs, deploys Convex, builds the app and deploys the Worker with `CONVEX_URL`.

Use `pnpm preview:worker` to run the built app inside the Worker runtime locally. Local development credentials and services are not production configuration.
