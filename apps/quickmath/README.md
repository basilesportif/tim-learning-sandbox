# Quickmath

Rapid-fire arithmetic practice for addition and subtraction.

## Rules

- Problems are single operations: `A + B` or `A - B`
- `A` is from `0..30`
- `B` is from `2..4`
- Correct answer is always in `0..30`
- Each question shows 3 consecutive answer choices
- Choices always stay in `0..30`
- Per-attempt timer runs while the question is active
- Feedback:
  - Correct: `Great job!`
  - Incorrect: `Try again!`
- Incorrect answers keep the same question and restart the timer
- Correct answers auto-advance after a short delay

## Audio

The app uses Web Audio to play a simple `beep, beep` pattern while the timer is active.
A start button is used to unlock audio on iPad/mobile browsers.

## Development

```bash
cd apps/quickmath
npm install
npm run dev
```

## Build

```bash
cd apps/quickmath
npm run build
```
