# BountyOS

AI Bounty Hunter → Solver → Earner

Phase 1 focuses on discovering, verifying, analyzing, scoring, and ranking real GitHub bounty opportunities.

## Phase 1

- GitHub bounty discovery
- Bounty normalization and reward extraction
- Verification and confidence signals
- Repository intelligence
- Competition analysis
- User technical-fit scoring
- Effort, success, and acceptance estimates
- Transparent opportunity scoring
- Saved/skipped/attempt tracking
- Provider abstractions for GitHub and AI

## Safety boundary

Phase 1 does not execute repository code, push branches, create pull requests, claim bounties, or post GitHub comments.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

See `.env.example` for configuration.
