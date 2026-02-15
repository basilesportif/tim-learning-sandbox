let audioContext = null;
let countdownIntervalId = null;
let countdownActive = false;

function getAudioContext() {
  if (audioContext) {
    return audioContext;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('Web Audio API is not supported in this browser.');
  }

  audioContext = new AudioContextClass();
  return audioContext;
}

function scheduleTonePair(context, firstFrequency, secondFrequency) {
  const firstToneTime = context.currentTime + 0.01;
  const secondToneTime = firstToneTime + 0.2;

  const playTone = (frequency, startTime) => {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startTime);

    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.18, startTime + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.1);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + 0.11);
  };

  playTone(firstFrequency, firstToneTime);
  playTone(secondFrequency, secondToneTime);
}

function playCountdownPair() {
  if (!countdownActive) {
    return;
  }

  let context;
  try {
    context = getAudioContext();
  } catch {
    return;
  }

  if (context.state === 'suspended') {
    context.resume().catch(() => {});
    return;
  }

  scheduleTonePair(context, 880, 660);
}

export async function initAudioContext() {
  const context = getAudioContext();

  if (context.state === 'suspended') {
    await context.resume();
  }
}

export function startCountdownBeeps() {
  if (countdownActive) {
    return;
  }

  countdownActive = true;
  playCountdownPair();
  countdownIntervalId = window.setInterval(playCountdownPair, 1000);
}

export function stopCountdownBeeps() {
  countdownActive = false;

  if (countdownIntervalId !== null) {
    window.clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }
}
