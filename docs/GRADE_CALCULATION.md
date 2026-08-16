# Grade Calculation Domain

Phase 3 is a deterministic manual grade tracker. Its calculation module does
not use AI, scrape grades, parse documents, or persist a calculated result as
authoritative data. The implementation is in
`timeline-scele-auth/src/grades/gradeCalculation.js`.

Phase 4 can create categories/components from a user-reviewed CSV/XLSX draft,
but it does not change any calculation semantics. Commit passes normalized
inputs through the same grade validation and gradebook service as manual
creation. The imported inputs then become ordinary user-authored source data;
calculated output remains derived and non-authoritative. See
`GRADE_IMPORT.md`.

## Terms

- **Earned contribution**: contribution already earned against a final score
  of 100, excluding scenario assumptions.
- **Current weighted score**: earned contribution plus actual bonus
  contribution. It is capped only when `capFinalScoreAt100` is explicitly true.
- **Graded weight**: known effective weight whose actual score is available.
- **Average on graded weight**: `earned contribution / graded weight × 100`.
- **Remaining known weight**: effective weight whose score is pending.
- **Unknown weight**: weight that cannot be assigned without user input.
- **Scenario contribution**: contribution from explicit what-if assumptions.

The UI must not label both earned contribution and graded-weight average as
the same “current grade”.

## Pending versus zero

```text
scoreStatus = known, earnedScore = 0
→ real score zero
→ included in graded weight
→ contribution may be zero

scoreStatus = pending
→ no normalized score
→ not included in graded average
→ known effective weight remains available for target calculation
```

`excluded`, `not_applicable`, manually dropped, automatically dropped, and
archived components do not contribute.

## Point normalization

For a known component in points mode:

```text
normalized score = earnedScore / maxScore × 100
```

`maxScore` must be finite and greater than zero. Internal calculations use
JavaScript `Number` without early rounding. The dashboard rounds only display
values to at most two decimal digits.

Scores above the nominal maximum are not silently clamped. A non-bonus
percentage input above 100 is rejected. Explicit bonus input may exceed 100.

## Effective weights

### Uncategorized or derived category

A component with `weightMode=fixed` uses its explicit weight. Unknown or
equal-in-category weight outside a fixed category remains unknown.

### Fixed simple-mean category

The category weight is divided equally among included, non-dropped
components. Pending components keep their share; the share is not reassigned
to currently graded components.

### Fixed weighted-mean category

Fixed component weights are treated as within-category percentages.
`equal_in_category` components divide the unallocated within-category
percentage only when no unknown component weight exists. Unknown weight is
never guessed.

### Fixed sum-points category

Effective category weight is allocated in proportion to each component's
`maxScore`. Category progress is:

```text
sum known earned points / sum known max points × 100
```

For example, `80/100 + 40/50 = 120/150 = 80%`.

## Weighted contribution

For each known base component:

```text
contribution = normalized score × effective weight / 100
```

Example:

```text
Tugas 20%, score 85 → contribution 17
UTS 30%, score 70 → contribution 21
Kuis 10%, score 90 → contribution 9
earned contribution = 47
graded weight = 60
average on graded weight = 47 / 60 × 100 = 78.333...
```

## Target calculation

For a target and remaining known weight:

```text
required contribution = target - earned contribution
required average =
  required contribution / remaining known weight × 100
```

Statuses:

- `already_achieved`: current contribution already reaches the target.
- `reachable`: required average is below 100.
- `requires_perfect_score`: required average equals 100.
- `impossible`: required average exceeds 100 or there is no remaining weight.
- `indeterminate`: material weight is unknown and the target has not already
  been earned.
- `not_set`: no target was provided.

An already-earned target remains `already_achieved` even if another future
weight is unknown, because later positive contribution cannot undo the earned
amount. An impossible or indeterminate result is valid domain output and returns HTTP
200. HTTP 400 is reserved for invalid input.

When unknown weight exists, a numeric target cannot be asserted with
certainty. The API may expose the known-weight formula as conditional
information, but the status remains `indeterminate`.

## Drop lowest

Only components with an actual or explicit scenario score are ranked.
Pending is never treated as the lowest score. Ranking uses normalized score.

Manual drops are applied first. Automatic drop does not drop the same component
twice. If the number of comparable components is less than or equal to
`dropLowestCount`, the calculation keeps at least one score and emits
`INSUFFICIENT_COMPONENTS_FOR_DROP`.

The automatic result is calculation-only and never changes `isDropped`.

## Bonus

Bonus contribution requires an explicit fixed component weight:

```text
final displayed score = base earned contribution + bonus contribution
```

Bonus does not increase the base denominator of 100. It may produce a result
above 100. The gradebook default is `capFinalScoreAt100=false`; an explicit cap
changes display/result output but does not erase the bonus breakdown.

## Scenarios

A scenario contains explicit normalized-score assumptions for pending,
non-dropped components. Calculation distinguishes:

- `actual`: stored known score;
- `assumed`: scenario-only value;
- `pending`: no actual or assumed value.

Example:

```text
actual earned contribution = 47
assume UAS 80 at 40%
scenario contribution = 32
projected score = 79
```

The component remains pending and its `earnedScore` is not changed.

## Warnings

The domain may emit:

```text
UNKNOWN_WEIGHT
TOTAL_WEIGHT_BELOW_100
TOTAL_WEIGHT_ABOVE_100
PENDING_SCORE
INVALID_MAX_SCORE
TARGET_INDETERMINATE
TARGET_IMPOSSIBLE
INSUFFICIENT_COMPONENTS_FOR_DROP
SCORE_ABOVE_MAX
CATEGORY_WEIGHT_UNALLOCATED
CATEGORY_COMPONENT_WEIGHT_ABOVE_100
UNKNOWN_CATEGORY
EMPTY_CATEGORY
```

Warnings explain incomplete or unusual data. They are not silently corrected.

## Known limitations

- Mixed fixed/equal/unknown weights inside one weighted category remain
  indeterminate until unknown weights are resolved.
- Replacement components are validated as same-gradebook references but do
  not yet implement a policy for replacing prior contribution.
- Optional components are included until the user explicitly excludes,
  drops, or archives them.
- Category archive cascades component archive in multiple bounded batches and
  cannot be atomic across more than one Firestore batch.
- No letter-grade mapping, pass/fail scale, or institution-specific rounding
  policy is implemented.
- Import does not infer unknown weight, auto-normalize total weight to 100, or
  treat blank scores as zero. Formula-derived cached values remain reviewable
  input with a warning before commit.
