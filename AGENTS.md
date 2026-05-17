# AGENTS.md

## Project

This repo implements Travel Claims Copilot: a travel disruption claims intelligence assistant.

Read these files before making product or architecture decisions:
- PROJECT_BRIEF.md
- DATA_SCHEMA.md
- ROADMAP.md, if present

## Product Goal

Build a demo web app where a user describes a hotel or airline disruption, and the app returns:
- issue type
- relevant official policies / regulations
- similar community cases
- conservative / standard / aggressive asks
- evidence checklist
- reusable communication scripts
- cautions and uncertainty

## Important Product Boundaries

Do not present the app as legal advice.
Do not promise compensation.
Do not fabricate policies, cases, URLs, or compensation amounts.
Clearly separate:
- official policy / regulation
- company commitment
- community DP / goodwill reference
- synthetic examples

High-risk issues such as injury, litigation, large property loss, or complex insurance claims should trigger a professional-help warning.

## Recommended Implementation Direction

Prefer a simple deterministic workflow over a complex autonomous agent.

Initial workflow:
1. Extract structured facts from user input.
2. Classify provider_type, provider, and issue_type.
3. Search policies and cases.
4. Generate a structured response using retrieved data.
5. Allow user feedback / outcome logging.

Start with local JSON files if faster. Later migrate to Supabase Postgres and pgvector.

## Suggested Tech Stack

- Next.js
- TypeScript
- Tailwind
- Local JSON seed data for MVP
- Later: Supabase Postgres + pgvector
- LLM API abstraction in lib/llm.ts
- Retrieval logic in lib/retrieval.ts
- Classification logic in lib/classifier.ts

## Code Style

- Use TypeScript strict mode.
- Keep business logic in lib/.
- Keep UI components small.
- Avoid over-engineering.
- Prefer explicit types for Policy, Case, Script, AnalysisResult.
- Add sample data before building complex infrastructure.
- Write code that can later swap local JSON search for vector search.

## First Demo Scope

Only support these initial issue types:
- hotel_walk
- controllable_airline_delay
- controllable_airline_cancellation
- denied_boarding
- eu261_delay_or_cancellation

Do not build:
- payments
- login
- automated scraping
- email sending
- claim submission
- mobile app
- complex multi-agent orchestration

## Expected Demo UX

Home page:
- textarea for user problem
- "Analyze" button

Result page:
- issue type
- case strength
- official basis
- similar cases
- suggested asks
- evidence checklist
- scripts with copy buttons
- feedback section