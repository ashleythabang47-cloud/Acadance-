# Testing

## Automated tests (backend)

Run with:
```bash
cd backend
npm test
```

42 tests across 6 suites, all using mocked models and a mocked AI service —
**no live database connection or Anthropic API credits are required** to run
these.

| Suite | What it covers |
|---|---|
| `grading.test.ts` | Pure logic: MCQ answer comparison, percentage calculation, score validation |
| `streakLogic.test.ts` | The streak rule itself — extending on consecutive days, resetting after a gap, not double-counting same-day activity, preserving longest streak |
| `aiService.test.ts` | Defensive JSON extraction from AI responses (handles prose wrapping, markdown fences) |
| `auth.integration.test.ts` | Register/login validation, duplicate email rejection, wrong-password rejection, successful token issuance |
| `performance.integration.test.ts` | Auth requirement, score validation (negative, over max), successful record creation |
| `quiz.integration.test.ts` | Study-text length validation, quiz generation (AI mocked), MCQ grading (confirms **no AI call** is made), short-answer grading (confirms AI **is** called) |

That last point in `quiz.integration.test.ts` is worth calling out specifically
in a dissertation testing section: the tests assert not just that grading
works, but that the cost-conscious architecture decision (only calling the AI
for open-ended answers, never for multiple-choice) actually holds in code,
not just in the write-up.

### Why models are mocked instead of hitting a real test database
Mocking the model layer (`jest.mock("../models/...")`) means these tests
verify **controller logic** — validation rules, status codes, what gets
called and with what arguments — independently of whether MySQL happens to be
running. This is faster, more reliable in CI, and isolates bugs to the right
layer. A real end-to-end test (frontend → backend → actual MySQL) is still
worth doing manually before a demo — see the checklist below.

## Manual test checklist — AI Quiz module

The AI quiz generation and grading endpoints are mocked in the automated
suite (to avoid spending API credits on every test run), so they still need
a real pass once Anthropic credits are available. Run through this once:

- [ ] Generate a quiz from a short paste of real study notes (~200 words) —
      confirm the returned questions are actually relevant to the material,
      not generic
- [ ] Generate a quiz with `numQuestions` at the minimum (1) and maximum (15)
      — confirm both work and the count in the response matches
- [ ] Take a quiz with all multiple-choice answers correct — confirm score
      is 100% and no noticeable delay (no AI call needed for MCQ)
- [ ] Take a quiz with a short-answer question, answering **correctly but in
      different words** than the reference answer — confirm the AI grader
      marks it correct (this is the actual point of using AI grading over
      exact-match)
- [ ] Take a quiz with a short-answer question, answering **incorrectly** —
      confirm it's marked wrong with reasonable feedback text
- [ ] Submit a quiz with a mix of MCQ and short-answer — confirm the score
      reflects both correctly
- [ ] Try generating a quiz with study text under 50 characters — confirm
      the 400 error appears in the UI before any API call is made
- [ ] Check the Anthropic console dashboard after a test session — confirm
      the number of API calls roughly matches (1 generation call + 1 grading
      call per short-answer question, 0 for MCQ-only submissions)

## Manual test checklist — Voice Study Sessions

WebRTC's actual peer connection behavior can't be meaningfully unit tested
(it depends on real browser APIs, network conditions, and microphone
hardware), so this stays a manual pass:

- [ ] Create a session in one browser, confirm the join code displays
- [ ] Join the same session from a second browser (different account) using
      the join code
- [ ] Confirm both sides can hear each other after allowing microphone access
- [ ] Test mute/unmute — confirm the muted side's audio actually stops
- [ ] Leave the room from one side — confirm the other side sees them
      disappear from the participant list
- [ ] Try joining a code for a session that has already ended — confirm a
      clear error rather than a silent failure
