# BountyOS

**AI Bounty Hunter → Solver → PR Agent → Review Agent → Earner**

BountyOS finds software-development opportunities where your estimated probability of success and acceptance justify the expected return per hour.

## AI providers

BountyOS has a provider-independent AI layer. **Gemini is the default** and can use Google's Gemini API Free Tier for eligible models/projects. Local Ollama is also supported when you want the model to run on your own machine.

### Gemini

Create an API key in Google AI Studio and configure:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-3.7-flash
```

Never put the API key in client-side code or commit it to Git.

### Local Ollama

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3-coder
```

## Implemented architecture

1. **Hunter** — GitHub discovery, reward extraction, normalization, verification signals, repository intelligence, competition analysis, technical fit and transparent opportunity scoring.
2. **Profile** — GitHub OAuth, skills, difficulty/effort preferences, currencies and work-type preferences.
3. **Solver** — provider-agnostic AI planning and patch generation using a bounded set of repository files. Repository code is treated as untrusted input and is never executed by the agent.
4. **PR Agent** — creates an isolated branch, applies the generated files, and creates a pull request only after explicit user approval.
5. **Review Agent** — reads PR reviews/comments and produces actionable feedback for another user-approved solver run.
6. **Earnings** — persistent attempts, PR records and payment/earning records are ready for reconciliation.
7. **Learning-ready data model** — agent runs, predictions and outcomes are persisted for future calibration.

## Runtime boundary

BountyOS does not silently claim bounties, merge PRs, execute arbitrary repository code, or send GitHub comments. Production deployments should add an isolated sandbox before enabling test execution or unrestricted coding-agent workflows.

## Setup

```bash
npm install
cp .env.example .env.local
npx prisma generate
npx prisma db push
npm run dev
```

Configure a GitHub OAuth App with callback URL:
`http://localhost:3000/api/auth/github/callback`

Required: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `DATABASE_URL`, `SESSION_SECRET`.
Optional: `GITHUB_TOKEN` for server-side public discovery.

## API surface

- `GET /api/bounties` — discover and rank live opportunities
- `GET /api/bounties/:id` — opportunity detail
- `POST /api/bounties/analyze` — repository + competition analysis
- `POST /api/bounties/action` — save / skip / attempt
- `GET /api/me` — current user
- `PUT /api/profile` — skills/preferences
- `POST /api/ai/solve` — generate an implementation plan/patch
- `GET /api/ai/health` — inspect configured AI provider

## Cost philosophy

No paid AI provider is required for development: Gemini currently offers a Free Tier for eligible API models/projects, subject to rate limits. Ollama provides a local-provider option. GitHub, PostgreSQL, and AI providers remain replaceable through adapters.
