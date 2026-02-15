const MIN_A = 0;
const MAX_A = 30;
const MIN_B = 2;
const MAX_B = 4;
const MIN_ANSWER = 0;
const MAX_ANSWER = 30;

function randomInt(min, max, rng = Math.random) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function generateProblem(rng = Math.random) {
  while (true) {
    const left = randomInt(MIN_A, MAX_A, rng);
    const right = randomInt(MIN_B, MAX_B, rng);
    const op = rng() < 0.5 ? '+' : '-';
    const answer = op === '+' ? left + right : left - right;

    if (answer >= MIN_ANSWER && answer <= MAX_ANSWER) {
      return { left, op, right, answer };
    }
  }
}

export function generateChoices(answer, rng = Math.random) {
  const startMin = Math.max(MIN_ANSWER, answer - 2);
  const startMax = Math.min(answer, MAX_ANSWER - 2);

  if (startMin > startMax) {
    throw new Error(`No valid consecutive choices for answer ${answer}`);
  }

  const start = randomInt(startMin, startMax, rng);
  return [start, start + 1, start + 2];
}

export function formatProblem(problem) {
  if (!problem) return '';
  return `${problem.left} ${problem.op} ${problem.right}`;
}
