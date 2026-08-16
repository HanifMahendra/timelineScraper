# Study Plan

Phase 5 adds a deterministic personal study planner without an AI API, runtime
web fetching, scheduler, or notification service. It is downstream of SCELE
activity snapshots and the optional manual gradebook; neither source is
modified by study planning.

## Subject normalization and catalog mapping

`normalizeSubjectName` applies Unicode NFKD normalization, lowercasing,
whitespace/punctuation cleanup, and a documented small set of administrative
suffix removals (class, semester, regular/parallel label). It deliberately
preserves academic numbers such as `DDP 2`. The result contains a normalized
key, tokens, and removed tokens; the normalized key is not an ownership key.

`matchSubjectToCatalog` checks exact normalized names, then explicit aliases,
then conservative token overlap. Exact/alias matches are high confidence;
unambiguous token matches above the fixed threshold are medium. Low or
ambiguous candidates are returned for review without automatic assignment.

The local versioned catalog contains a small curated set: programming
fundamentals, data structures, algorithms, databases, statistics, linear
algebra, operating systems, computer networks, software engineering, machine
learning, and web development. Users may keep any subject custom.

## Topic roadmap and DAG

Each catalog subject has four scoped topics with objectives, estimates,
difficulty, and curated prerequisite keys. Applying a reviewed catalog creates
idempotent user topics and converts prerequisite keys to topic IDs. Custom
topics remain supported. The server loads a bounded same-subject graph and
rejects missing prerequisites, cross-subject edges, self-edges, and indirect
cycles before a write.

## Priority formula

The pure priority calculator returns score, reasons, warnings, and a component
breakdown. Components are clamped and the final score is clamped to 0–100:

```text
deadline urgency  0–40  (linear within 14 days; overdue emits a warning)
grade weight      0–25  (pending, known fixed weight; saturates at weight 30)
target gap        0–20  (known current and target; saturates at gap 30)
prerequisite      0–10  (unfinished prerequisite signal)
manual override   0–20  (user override 0–100)
```

Unknown weight remains unknown, contributes no guessed number, and emits
`GRADE_WEIGHT_UNKNOWN`. Missing grade data is valid; catalog order and deadline
signals still produce a plan.

## Scheduling

`generateStudyPlan` is pure and uses local calendar dates plus an explicit IANA
timezone boundary. It excludes completed/skipped topics, validates each DAG,
orders ready topics by priority, keeps prerequisites first, splits estimates
within minimum/preferred/maximum session constraints, and respects available
days, weekend choice, time-block capacity, daily minutes, horizon, and session
limits. Remainders are not rounded away. Material that cannot fit is returned
as `unscheduledTopics` with a warning rather than exceeding capacity.

Activity integration is subject-level unless a user explicitly links a topic;
no activity title is treated as an authoritative topic guess. Grade integration
reads pending components and the existing grade result only. It never treats a
pending score as zero or changes grade calculation.

## Draft, apply, and regeneration

Generation writes only `studyPlanDrafts` and candidate draft sessions. The
response exposes the version and random apply token to that authenticated user.
Authoritative plan sessions are written only after an explicit apply with both
values. Drafts expire after 24 hours by default. Deterministic plan/session IDs
make an identical apply retry idempotent.

Regeneration targets an existing plan but remains a preview. Completed and
in-progress sessions are preserved. Manual sessions are preserved unless the
request explicitly opts to replace them. Only future planned generated sessions
are marked `rescheduled`, and that happens in the same bounded apply transaction
as replacement sessions. Large regeneration comparisons fail safely before any
authoritative write.

## Progress

Topic progress supports not started, in progress, completed, and skipped plus
four mastery levels. Completing all non-rescheduled plan sessions for a topic
marks it complete; reopening a session/topic is supported. Subject summaries do
not count skipped topics as completed and separate planned from completed
minutes.

## Limits and limitations

All list operations and generation are bounded by the Phase 5 environment
limits. A draft apply is additionally kept below 390 candidate/replacement
operations so it fits one Firestore transaction with metadata writes. There is
no automatic topic extraction, authoritative keyword-to-topic mapping, AI,
calendar integration, scheduler, or notification delivery in this phase.
