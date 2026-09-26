# Memento

**Keep the context behind the code.**

A maintenance review workspace that brings a file’s changes, the reason for them, and their test evidence into one portable handover.

[Quick start](#quick-start) · [Workflow](#the-workflow) · [Demo](#try-the-demo) · [Evidence model](#what-the-evidence-means) · [Architecture](#architecture)

## Why Memento

A developer inherits a change. The diff shows what moved, but the requirement is in a conversation, the test output is in someone’s terminal, and the reasoning may disappear when the author leaves.

AI-assisted development makes that handover especially important: generating a change does not automatically preserve the context needed to maintain it.

Memento keeps that context with the code. A reviewer can inspect the original and proposed versions, understand the behaviour that must remain true, inspect attached test results, and export a record another developer can reopen.

## The workflow

| Stage | What you do | What stays with the review |
| --- | --- | --- |
| **Changes** | Paste or load the original and proposed versions of a file. | A line diff and maintainer notes. |
| **Context** | Capture the requirement and behaviour to preserve. | The reason for the change and its constraints. |
| **Checks** | Review in Bob, run your local tests, and import the command record. | Captured output, exit status and source fingerprints. |
| **Handover** | Export the review and import it in another Memento workspace. | Code, context, notes and attached evidence. |

Imported handovers receive a new review ID. Existing reviews are not overwritten, and Memento recalculates the proposed-code fingerprint rather than trusting an exported status label.

## Quick start

### Prerequisites

- Node.js 22.x and npm. Development was performed with Node.js 22.23.1.
- The project source and its committed `package-lock.json`.
- IBM Bob IDE for the Bob-assisted repository review steps.

From the project root:

```bash
npm ci
npm run dev
```

Open the localhost address printed in your terminal. No runtime model API key is required for the included workspace or sample lab.

For a production build:

```bash
npm run build
npm start
```

Reviews are stored in the current browser, separately for each origin and port. Keep using the same address to access saved reviews. Export any review you want to retain before clearing browser storage or closing an incognito session.

## Try the demo

Memento includes two complementary examples. They exercise different parts of the workflow and have different evidence sources.

### 1. Inspect a regression in the verification lab

Open **SignalGrid**, select **Proposed change**, and choose **Verify change**.

The fictional delivery lab models three transient failures before a successful attempt. Increasing the retry allowance enables recovery, but removing the ownership claim allows both concurrent callers to start delivery operations.

| Configuration | Retries | Claim preserved | Result in the lab |
| --- | ---: | :---: | --- |
| Original | 2 | Yes | Exhausts its three attempts before recovery. |
| Proposed change | 5 | No | Recovers, but allows duplicate operations and additional sends on replay. |
| Corrected change | 5 | Yes | Recovers while preserving ownership; all four checks pass. |

Choose **Review correction**, inspect the change, and verify again. The checks and ordered trace come from executing the selected fixed configuration on the server.

This is an isolated, single-process simulation with deterministic transport outcomes. It does not send messages, execute uploaded code, or establish distributed exactly-once delivery.

### 2. Hand over a repository correction

The separate SignalGrid fixture contains a routing-summary example:

```ts
// Original: counts pending records as failures.
failed: records.length - delivered
```

The correction counts each state explicitly:

```ts
const delivered = records.filter(r => r.finalStatus === "delivered").length;
const failed = records.filter(r => r.finalStatus === "failed").length;
const pending = records.filter(r => r.finalStatus === "pending").length;
```

The required behaviour is straightforward: pending-only input must report zero failures, status counts must sum to the total, and attempt totals must remain accurate.

Bob assisted with the correction and regression tests. The captured local test run reported **32 passing assertions**, including comparisons between a copied original formula and the corrected function. This is a before/after comparison within the tests, not a failing run of an original Git checkout.

The review itself is browser-local, rather than preloaded into every workspace. To reproduce the workflow, create a review using `docs/review-inputs/router.before.ts.txt` and `demo/signalgrid/router.ts`, add the requirement, then record and attach the test evidence below.

## Record and attach test evidence

Run the recorder from the repository containing the proposed source file:

```bash
node scripts/record-memento.cjs \
  demo/signalgrid/router.ts \
  router-test-evidence.json \
  -- npm test
```

The recorder runs the explicit command after `--`, captures its output and exit information, and fingerprints the selected source file before and after execution. Choose a new output filename for each run; existing output files are not overwritten.

In Memento:

1. Open the matching review’s **Checks** tab.
2. Select **Add or replace evidence**, or **Choose evidence JSON** when no evidence is attached.
3. Import `router-test-evidence.json`.
4. Inspect the result, captured output and fingerprint details.
5. Open **Handover** and export the review.
6. In another browser workspace, select **Import handover** and choose that exported handover JSON.

The recorder’s evidence JSON and Memento’s handover JSON are different files. Evidence attaches to an existing review; a handover contains the review needed to reopen it.

For another repository, copy `scripts/record-memento.cjs` there and supply its source path and actual test command. Review captured output before sharing it.

## What the evidence means

Memento distinguishes two sources of results:

| Evidence source | What Memento does | What it does not establish |
| --- | --- | --- |
| **Built-in verification lab** | Executes a fixed sample configuration and returns runtime assertions and a trace. | Behaviour of arbitrary repository code or external services. |
| **Imported local command record** | Validates the record’s structure and compares its source fingerprints with the proposed code. | Authenticity of execution, test coverage, or the state of the complete repository. |

### Fingerprint fields

| Field | Meaning |
| --- | --- |
| `sha256Before` | Source-file fingerprint immediately before the recorded command. |
| `sha256After` | Source-file fingerprint immediately after the recorded command. |
| `proposedCodeSha256` | Fingerprint computed from the review’s proposed code during export. |

The first two fields refer to command checkpoints, **not original and proposed code revisions**. Equal values mean the recorded contents match at those checkpoints; they do not rule out an intervening change.

**Imported command passed** means the imported record reports exit code zero without a termination signal, its checkpoint hashes match, and its ending hash matches the proposed code. It is not independent verification or approval to merge.

A nonzero exit or termination remains a failure. Different source contents and changes across command checkpoints are shown separately. The fingerprint covers one file; it does not cover the test suite, dependencies or execution environment.

## Built with IBM Bob

IBM Bob IDE supported multiple steps of development: scaffolding, the rehearsal backend, UI implementation, the pending-status correction and regression tests, and a fresh-task handover assessment.

Within the workflow, **Prepare Bob review** copies a task containing the change and its context. The developer runs that task in Bob with the repository open. Bob can inspect the surrounding implementation and help develop the correction and tests; Memento retains the resulting review context and imported command evidence.

The fresh-task assessment exposed confusion between command-checkpoint hashes and code revisions. That feedback led to clearer fingerprint labels and an explanatory field guide in exported handovers.

Genuine Bob task session-summary screenshots are retained in [`bob_sessions/`](bob_sessions/). Memento does not call a Bob API, automatically operate the IDE, or treat its own exports as evidence of Bob usage.

## Architecture

| Location | Responsibility |
| --- | --- |
| `src/app/page.tsx` | Review workspace, navigation, local storage and handover actions. |
| `src/components/memento/` | Diff viewer and imported-evidence interface. |
| `src/lib/memento/workspace.ts` | Review structure, diff generation, Bob prompt and export. |
| `src/lib/memento/evidence.ts` | Evidence parsing, content hashing and binding status. |
| `src/lib/memento/import-handover.ts` | Validates and reconstructs imported repository reviews. |
| `src/lib/memento/verification.ts` | Isolated runner for the fixed sample configurations. |
| `src/app/api/memento/verify/route.ts` | Server endpoint used by the sample lab. |
| `scripts/record-memento.cjs` | Local command recorder. |
| `demo/signalgrid/` | Fictional repository fixture used for maintenance exercises. |

The application uses Next.js, React and TypeScript. Review contents remain in browser storage; the built-in verification endpoint receives the selected sample revision. Local test commands execute through the recorder on the developer’s machine, not through the web application.

## Validation

Run the repository fixture tests and production build:

```bash
npm test
npm run build
```

Additional focused checks are provided in:

- `scripts/verify-memento.ts`: sample behaviour, concurrent-run isolation, diff reconstruction and evidence validation.
- `scripts/verify-status.ts`: success, failure, mismatch and unavailable-fingerprint states.
- `scripts/verify-handover.ts`: export/import preservation, new identities, rejected inputs and protection against imported pass-label overrides.

To run those checks without adding a test framework:

```bash
test_dir="$(mktemp -d)"
npx --no-install tsc \
  --module commonjs --target es2022 --moduleResolution node \
  --esModuleInterop --skipLibCheck --outDir "$test_dir" \
  scripts/verify-memento.ts scripts/verify-status.ts scripts/verify-handover.ts

node "$test_dir/scripts/verify-memento.js"
node "$test_dir/scripts/verify-status.js"
node "$test_dir/scripts/verify-handover.js"
```

The handover export/import path has also been exercised in a separate incognito workspace. The Bob assessment was an AI rehearsal; it was not a human usability study. Real-developer productivity gains and demand have not yet been measured.

## Current scope

- One source file per review, with up to 500 lines and 50,000 characters per version.
- Up to 20 browser-local reviews; no shared accounts or synchronization.
- Repository handover imports up to 500 KB. Built-in sample-run exports cannot be imported as repository evidence.
- Sample run history lasts for the current session.
- No GitHub integration, arbitrary uploaded-code execution or automatic in-app AI analysis.
- No production delivery guarantee or automated merge approval.

SignalGrid, its incidents and its recipients are fictional. The included demonstrations require no external dataset. The routing summary has no demonstrated production caller, and downstream benefits remain unmeasured.

---

**Memento keeps the change understandable after the conversation ends.**
