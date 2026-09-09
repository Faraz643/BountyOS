# BountyOS

BountyOS is an AI-assisted bounty operating system for finding paid software work, analyzing feasibility, solving issues, validating changes, and preparing pull requests.

## Discovery model

BountyOS is **paid-work first**. The default feed is `Verified paid only` rather than a generic GitHub issue feed.

The discovery pipeline:

```text
GitHub open issues
      ↓
Bounty/reward search
      ↓
Issue comments fetched
      ↓
Monetary evidence extracted
      ↓
Algora `/bounty $...` evidence detected
      ↓
Reward confidence calculated
      ↓
Paid / verified filtering
      ↓
Personal fit + effort + competition scoring
      ↓
Rank by opportunity
```

### Reward states

- **Verified paid** — a strong monetary signal was found, including Algora bounty-command evidence in GitHub comments.
- **Paid / verify** — a monetary amount was detected but the evidence is not strong enough to call it verified.
- **All GitHub issues** — optional discovery mode for research; these are not treated as paid opportunities.

BountyOS does not call an ordinary GitHub issue a paid bounty simply because it has an interesting label or because a reward is unknown.

## Solver pipeline

```text
Verified bounty
   ↓
Start attempt
   ↓
Repository analysis
   ↓
AI solution plan
   ↓
Proposed changes
   ↓
Human approval
   ↓
Branch + commit
   ↓
Pull request
   ↓
Sandbox / CI
   ↓
AI PR review
   ↓
Earnings tracking
```

Repository changes require explicit approval; autonomous execution is not enabled by default.

## AI providers

BountyOS supports Gemini and local Ollama-based models through the provider abstraction. For development, a local coding model can be used without consuming cloud API credits.

## Local setup

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Configure `.env` with the database, GitHub OAuth, session secret, and the selected AI provider.

For Ollama:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5-coder:7b
```

For Gemini:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=...
```

## Important

Reward detection is evidence-based but cannot guarantee that a sponsor will pay. Always open the original bounty page/issue, read its terms and acceptance criteria, and verify eligibility before starting work.
