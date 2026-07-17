# Travel Claims Copilot

Travel Claims Copilot is a demo web app for exploring travel disruption claims and communication strategy.

The user describes a hotel or airline issue, and the app returns:

- issue type
- claim strength
- relevant official policies or regulations
- similar community datapoints
- conservative / standard / aggressive asks
- evidence checklist
- reusable communication scripts
- cautions and uncertainty

The product does **not** provide legal advice, promise compensation, or submit claims for users. It helps users organize facts, find relevant references, and prepare reasonable requests.

## Current Status

This repo is in an MVP / Phase 1 state.

The app currently uses:

- Next.js App Router
- TypeScript
- Tailwind CSS
- local JSON seed data
- deterministic structured fact extraction and classification
- explainable weighted retrieval with deterministic Top-K results
- approved-case filtering and deterministic response generation
- Vitest golden-scenario and quality-guard tests

There is no database, login, payment, scraping, email sending, or real LLM API integration yet.

The current knowledge base contains 4 policies, 55 reviewed case records (35 approved for
retrieval), and 8 reusable scripts. The first demo only publishes these five issue types:

- `hotel_walk`
- `controllable_airline_delay`
- `controllable_airline_cancellation`
- `denied_boarding`
- `eu261_delay_or_cancellation`

## How To Run

Install dependencies:

```bash
npm install
```

Start the local dev server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Build for production:

```bash
npm run build
```

Validate the data and run the retrieval test suite:

```bash
npm run validate:data
npm test
```

## Demo Test Inputs

Hotel walk:

```text
I had a confirmed Marriott Sheraton reservation booked directly, but when I arrived the front desk said the hotel was oversold and had no room. They moved me to a cheaper nearby hotel and did not offer compensation.
```

Airline controllable cancellation:

```text
United cancelled my flight because of a crew issue and rebooked me for tomorrow morning. The airport agent said they would not provide a hotel or meal voucher.
```

Airline controllable delay:

```text
My American Airlines flight was delayed overnight because of a mechanical problem.
```

Denied boarding / voluntary bump:

```text
Delta oversold my flight and the gate agent asked for volunteers to take a flight the next day.
```

EU261 disruption:

```text
My Air France flight from Paris was cancelled and I arrived at my final destination four hours late.
```

## Project Structure

```text
app/
  api/
    analyze/route.ts      Main analysis API
    scenarios/route.ts    Scenario catalog API
  page.tsx                Frontend demo page

data/
  policies.json           Official policy / regulation data
  cases.json              Consolidated, quality-reviewed case data
  scripts.json            Communication script data
  README.md               Review rules and current quality summary

lib/
  analyze.ts              Async orchestration and replaceable FactExtractor boundary
  classifier.ts           Structured fact extraction and issue classification
  retrieval.ts            Top-K local JSON policy/case/script retrieval
  retrievalScoring.ts     Explainable, deterministic ranking rules
  generator.ts            Deterministic AnalysisResult generation
  scenarios.ts            Scenario summary builder
  issueTaxonomy.ts        Issue labels, aliases, and normalization
  types.ts                Shared TypeScript types

tests/
  retrieval.test.ts       Five golden scenarios plus classification/retrieval guards
```

## Current Pipeline

The current analysis flow is deterministic and asynchronous at the extraction boundary:

```text
user input or selected scenario
  -> FactExtractor.extract()
  -> structured RetrievalQuery
  -> explainable policy / case / script scoring
  -> Top-K retrieval (3 policies / 3 cases / 2 scripts)
  -> generateAnalysis()
  -> AnalysisResult
```

Ranking considers issue type, provider, provider type, country, booking channel, loyalty
status, disruption reason, denied-boarding kind, text overlap, source authority, and case
confidence. Equal scores use stable IDs as a deterministic tie-breaker. Only cases with
`review_status: "approved"` can be returned.

### LLM API decision

No LLM API key is required for the current milestone. `FactExtractor` is already an async,
replaceable interface, so a later LLM-backed implementation will not require changing the
retrieval or generation layers.

The recommended next LLM step is a guarded fallback: call the LLM only when deterministic
extraction returns `unknown` or low confidence, require structured output, validate it against
the five-type taxonomy, and fall back safely on timeout or invalid output. A later natural-language
generation step should use retrieved evidence only.

The LLM should not invent policies, cases, compensation amounts, or sources.

## APIs

### `GET /api/scenarios`

Returns scenario summaries derived from local case data.

Example response shape:

```ts
{
  scenarios: Array<{
    issueType: string;
    label: string;
    caseCount: number;
    officialBasisCount: number;
    scriptCount: number;
    providers: string[];
    sampleCase?: {
      caseId: string;
      provider: string;
      brandOrAirline: string;
      facts: string;
    };
  }>;
}
```

### `POST /api/analyze`

Analyze by free-text description:

```json
{
  "description": "United cancelled my flight because of a crew issue and rebooked me tomorrow."
}
```

Analyze by selected issue type:

```json
{
  "issueType": "denied_boarding"
}
```

Analyze by selected case:

```json
{
  "caseId": "uscf_cx_ua_rebooking_mixed_carrier_2026_05"
}
```

Returns:

```ts
{
  issueType: string;
  strength: "low" | "medium" | "high";
  summary: string;
  officialBasis: Policy[];
  similarCases: Case[];
  suggestedAsks: {
    conservative: string[];
    standard: string[];
    aggressive: string[];
  };
  evidenceChecklist: string[];
  scripts: Script[];
  cautions: string[];
}
```

## Data Files

### `data/policies.json`

Official policies, regulations, dashboards, or company commitments.

Examples:

- Marriott Ultimate Reservation Guarantee
- DOT Airline Cancellation and Delay Dashboard
- EU passenger rights

### `data/cases.json`

Community datapoints, user-submitted cases, and synthetic demo examples.

Important rule: community cases are reference datapoints, not official rules. Forum cases should be rewritten as summaries and should preserve source links without copying full posts or personal information.

Each case has a `review_status`. Only `approved` cases are eligible for retrieval; `needs_review` and `excluded` records remain in the consolidated file for provenance. See `data/README.md` for the current review summary and rules.

### `data/scripts.json`

Reusable communication templates for channels such as:

- front desk
- airport counter
- phone / chat
- email
- corporate escalation
- regulator complaint

## Product Boundaries

The app should avoid:

- promising compensation
- presenting output as legal advice
- fabricating policies, cases, URLs, or amounts
- treating community datapoints as official rules
- handling injury, major property loss, litigation, or complex insurance claims as normal cases

The app should clearly separate:

- official policy / regulation
- company commitment
- community datapoint
- goodwill request
- synthetic demo data

## Roadmap

### Phase 1: Structured MVP

Completed:

- consolidated, reviewed local JSON data
- deterministic structured extraction for the five demo issue types
- explainable structured filtering and Top-K ranking
- approved-only case retrieval
- replaceable async fact-extraction boundary
- 20 automated golden-scenario and quality-guard tests

Recommended next work:

- connect the five supported scenarios to the frontend result experience
- add a small manual evaluation set using real user phrasing
- show missing facts and low-confidence clarification prompts
- add outcome feedback logging before expanding the taxonomy

### Phase 2: LLM-Assisted Analysis

Add `lib/llm.ts` only after the deterministic baseline is measured, then use an LLM for:

- low-confidence structured fact extraction
- issue classification assistance within the five-type allowlist
- natural-language answer generation from retrieved data

Keep deterministic fallback, schema validation, timeouts, and evidence-only generation.

### Phase 3: Database

Move local JSON data into a database such as Supabase:

- policies
- cases
- scripts
- outcomes
- scenario taxonomy

### Phase 4: Semantic Retrieval

Keep structured filters and add embeddings/vector search only when the reviewed corpus and
evaluation set show that lexical ranking is the bottleneck:

- preserve issue type, provider, route, location, booking channel, and review-status filters
- search similar cases by embeddings
- rank cases by relevance and outcome quality

### Phase 5: Product Loop

Let users submit outcomes:

- what they asked for
- what response they received
- whether the script helped
- final compensation or resolution

This outcome data can later improve case ranking and script suggestions.
