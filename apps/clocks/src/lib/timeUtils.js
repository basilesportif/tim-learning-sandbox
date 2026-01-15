// Time utility functions for the Clocks app

/**
 * Convert hour and minute to hour hand angle (in degrees)
 * Hour hand: 30 degrees per hour + 0.5 degrees per minute
 * -90 offset so 12 o'clock is at top (0 degrees in CSS rotation)
 */
export function hourToAngle(hour, minute = 0) {
  const baseAngle = (hour % 12) * 30;
  const minuteOffset = minute * 0.5;
  return baseAngle + minuteOffset - 90;
}

/**
 * Convert minute to minute hand angle (in degrees)
 * Minute hand: 6 degrees per minute
 * -90 offset so 12 o'clock is at top
 */
export function minuteToAngle(minute) {
  return minute * 6 - 90;
}

/**
 * Convert angle to hour (for drag interactions)
 * Returns hour 1-12
 */
export function angleToHour(angle) {
  const normalized = ((angle + 90) % 360 + 360) % 360;
  const hour = Math.floor(normalized / 30);
  return hour === 0 ? 12 : hour;
}

/**
 * Convert angle to minute (for drag interactions)
 * Snaps to 5-minute increments
 * Returns minute 0-55
 */
export function angleToMinute(angle) {
  const normalized = ((angle + 90) % 360 + 360) % 360;
  const rawMinute = Math.round(normalized / 6);
  // Snap to 5-minute increments
  const snapped = Math.round(rawMinute / 5) * 5;
  return snapped >= 60 ? 0 : snapped;
}

/**
 * Generate a random time with 5-minute increments
 * Returns { hour: 1-12, minute: 0-55 (by 5s) }
 */
export function generateRandomTime() {
  const hour = Math.floor(Math.random() * 12) + 1; // 1-12
  const minute = Math.floor(Math.random() * 12) * 5; // 0, 5, 10...55
  return { hour, minute };
}

/**
 * Format time as string (e.g., "3:05" or "12:30")
 */
export function formatTime(hour, minute) {
  const minuteStr = minute.toString().padStart(2, '0');
  return `${hour}:${minuteStr}`;
}

/**
 * Validate user answer against target time
 * @param {Object} targetTime - { hour, minute }
 * @param {Object} userAnswer - { hour, minute }
 * @param {string} mode - 'read' | 'set' | 'hour-only' | 'minute-only'
 */
export function validateAnswer(targetTime, userAnswer, mode) {
  switch (mode) {
    case 'read':
    case 'set':
      return targetTime.hour === userAnswer.hour &&
             targetTime.minute === userAnswer.minute;
    case 'hour-only':
      return targetTime.hour === userAnswer.hour;
    case 'minute-only':
      return targetTime.minute === userAnswer.minute;
    default:
      return false;
  }
}

/**
 * Snap angle to nearest 30 degrees (for hour hand)
 */
export function snapToHour(angle) {
  return Math.round(angle / 30) * 30;
}

/**
 * Snap angle to nearest 30 degrees (for 5-minute increments on minute hand)
 */
export function snapToFiveMinutes(angle) {
  return Math.round(angle / 30) * 30;
}
