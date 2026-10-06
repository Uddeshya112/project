# System design

## Users

| Role | Main tasks |
| --- | --- |
| College Admin / Super Admin | Approve and publish timetables, manage users and roles, plus everything a coordinator can do. |
| Coordinator | Maintain academic data, import the Excel workbook, generate and edit the draft timetable, manage versions. |
| HOD | Read the draft, student roster and audit log; teaching actions (cancel, make-ups, extra classes, unavailable periods); open polls. No master-data edits. |
| Faculty | Own timetable, cancel own classes, accept or decline make-up options, own unavailable periods, add an extra class for themselves. |
| Class Representative | Student view, polls for own section, requests to faculty and coordinators. |
| Student | Published timetable of own section and subgroup, vote once per poll. |

Exact rules: [permissions.md](permissions.md).

## Academic data

- **Academic year**: working days (any of Monday to Saturday), 1 to 16 periods with start and end times, breaks and lunch flagged.
- **Departments -> programs -> courses** (weekly lectures, tutorials, labs; credits; required equipment).
- **Faculty**: department, designation, teaching-hour limits, preferences including unavailable (protected) periods.
- **Rooms**: type (`LectureHall`, `SeminarRoom`, `TutorialRoom`, `ComputerLab`, `HardwareLab`), capacity, equipment, availability.
- **Groups** (sections) with subgroups (two by default) and a class representative; **students** (roll number, email, group, subgroup).
- **Course allocations**: course + faculty + group (+ optional subgroup) + session type + hours per week (+ preferred room). Lab and practical hours must be even because they are scheduled in 2-hour blocks.
- **Constraints**: soft constraints can be switched on and off; hard constraints cannot.

Input is type-checked against whitelists (`src/server/validate.ts`); references must exist, and records that are still in use cannot be deleted (409). The Excel import builds the new data on copies and commits only if every row is valid (`upsert` or `replace` mode; `replace` needs at least the Courses and Groups sheets).

## Timetable lifecycle

```
generate / move / swap / staff add  -> new numbered version, becomes the working draft (status Draft)
select a generated routine          -> working draft (refused if it has hard violations)
restore any version                 -> working draft
coordinator sets Draft / Review
admin approves (optional)           -> Approved (refused if the draft has hard violations)
admin publishes                     -> draft copied to the published snapshot (refused if hard violations)
```

- Coordinators, HODs and admins see the working draft. Faculty, class representatives and students see the last published snapshot; draft changes reach them only at the next publish.
- Every routine that produced sessions, and every move, swap or staff-added class, creates a numbered version with a health score. Selecting, restoring and locking do not create versions.
- Locked sessions are pre-placed by the next generation and never moved by local search.
- Cancellations, make-up classes and faculty-added extra classes change the published timetable and are mirrored into the draft (no new version).
- Publishing posts an in-app notification. Publishing does not require a prior approval.

## Generation

`POST /api/academic/generate` takes `budgetMode` (`FAST`, `BALANCED` default, `MAXIMUM_OPTIMIZATION`), `timeBudgetMs` (default 800, clamped to 100-3000 per routine) and optionally up to 3 `routines` with an `optimizationProfile`. By default it runs two routines, student-focused and faculty-focused, with fixed seeds. The first routine becomes the working draft. Each routine's result is checked by the independent validator and returned with violation counts, unscheduled hours, quality metrics and its version number.

### Engine (`src/lib/optimizationEngine.ts`)

1. **Compile.** For each allocation: candidate rooms of the right type (lab rooms for labs and practicals, otherwise lecture halls, seminar and tutorial rooms) with enough capacity, smallest first (best fit); feasible slots excluding lunch and the faculty member's unavailable periods; contiguous 2-hour blocks for labs. If an allocation has no suitable room or too few free slots, or a group, faculty member or the lab rooms need more hours than the week has, the engine returns these diagnostics without searching.
2. **Search.** Seeded backtracking over allocations, labs first, then the tightest domains. Faculty, room, group and subgroup occupancy are bitsets with one bit per slot. Labs are placed as 2-hour blocks; subgroups of one group can run in parallel, while a whole-group class blocks all its subgroups. Locked sessions are placed first (ones that no longer fit the data are skipped and planned again). Same input and seed give the same timetable.
3. **Local search** (not in `FAST`). Repeatedly swaps the slots of two single-hour sessions of the same group (never labs or locked sessions) and keeps the swap if hard constraints still hold and the soft penalty drops. Penalty terms: faculty gaps, consecutive faculty hours, student gaps, uneven student daily load, course distribution, room size fit, faculty preferences; weights depend on the profile (`STUDENT_FOCUSED`, `FACULTY_FOCUSED`, `BALANCED`).
4. **Health score** = 100 - 10 x (soft penalty / number of sessions), clamped to 0-100.

If the budget runs out before a complete timetable is found, the engine reports that and returns no sessions; it never returns a partial timetable as a result. The solver runs on the request thread, which is why the budget is capped.

**Validation.** `src/lib/independentValidator.ts` is separate from the engine. It checks generated routines and is run again on select, approve and publish. Moves and swaps are checked with its `validateProposedSessionMove` / `validateProposedSessionSwap`; single added classes with `checkHardConstraints` in `recoveryEngine.ts` (faculty, room and group clashes, room capacity, lab room for lab courses, unavailable periods).

## Cancellations, make-ups, polls, notifications

- Cancelling a class (faculty: own classes only) marks it Cancelled, creates a make-up task and proposes up to 5 make-up options from `findSelfHealingRecoverySlots`: slots where the group has no running class (a slot freed by another cancellation counts as free) and the faculty member is not teaching, each with the smallest free room that fits the whole group (a lab room if the course requires a lab). Slots in the faculty member's unavailable periods are not excluded but score lower. Options are ranked by a weighted score.
- Accepting an option re-checks room, faculty and group against the live timetable, adds a Makeup session and rejects the other options of that task. Declining rejects one option.
- Class representatives (own section) and staff open polls with 2-6 options; a poll is open for 3 days; students and class representatives of that section vote once.
- Class representatives, faculty and staff post in-app requests or announcements (10 per minute per user). Read state is per user; the latest 300 notifications are kept.

## Size

The sample dataset (500 faculty, 80 rooms, 32 groups, 1,280 students, 288 allocations) is the size the tests run against. No load testing has been done. All data is held in memory in one process; see the known limits in [PROJECT_STATE.md](../PROJECT_STATE.md).
