# BountyOS

**AI Bounty Hunter → Solver → PR Agent → Review Agent → Earner**

BountyOS finds software-development opportunities where your estimated probability of success and acceptance justify the expected return per hour.

## Implemented architecture

1. **Hunter** — GitHub discovery, reward extraction, normalization, verification signals, repository intelligence, competition analysis, technical fit and transparent opportunity scoring.
2. **Profile** — GitHub OAuth, skills, difficulty/effort preferences, currencies and work-type preferences.
3. **Solver** — provider-agnostic AI planning and patch generation using a bounded set of repository files. Repository code is treated as untrusted input and is never executed by the agent.
4. **PR Agent** — creates an isolated branch, applies the generated files, and creates a pull request **only after explicit user approval**.
5. **Review Agent** — reads PR reviews/comments and produces actionable feedback for another user-approved solver run.
6. **Earnings** — persistent attempts, PR records and payment/earning records are ready for reconciliation.
7. **Learning-ready data model** — agent runs, predictions and outcomes are persisted for future calibration.

## Important runtime boundary

The architecture supports all planned phases, but autonomous execution is intentionally gated. BountyOS does **not** silently claim bounties, merge PRs, execute arbitrary repository code, or send GitHub comments. Production deployments should add an isolated sandbox (container/VM) before enabling test execution or unrestricted coding-agent workflows.

## Setup

```bash
npm install
cp .env.example .env.local
npx prisma db push
npm run dev
```

Configure a GitHub OAuth App with callback URL:
`http://localhost:3000/api/auth/github/callback`

Required: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `DATABASE_URL`, `SESSION_SECRET`.
Optional: `GITHUB_TOKEN` for server-side public discovery and `AI_API_KEY` for the solver/review agents.

## API surface

- `GET /api/bounties` — discover and rank live opportunities
- `GET /api/bounties/:id` — opportunity detail
- `POST /api/bounties/analyze` — repository + competition analysis
- `POST /api/bounties/action` — save / skip / attempt
- `GET /api/me` — current user
- `PUT /api/profile` — skills/preferences
- `POST /api/agent/solve` — generate an implementation plan/patch
- `POST /api/agent/pr` — apply an approved patch and create a PR
- `POST /api/agent/review` — analyze PR feedback

## Cost philosophy

No paid infrastructure is required by the application architecture. GitHub APIs, PostgreSQL, and an OpenAI-compatible AI provider are abstracted so providers can be swapped later.
