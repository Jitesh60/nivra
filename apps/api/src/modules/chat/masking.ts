/**
 * Contact masking for chat (PRD §5.4): phone numbers, emails, UPI IDs and
 * messaging links are replaced with `•••` so deals aren't taken off-platform
 * before a booking is confirmed. The sender still sees what they typed.
 *
 * Phone numbers are found by digit *groups* (runs separated by spaces, dots,
 * dashes or brackets), so "98765 43210", "+91-98765-43210" and "9 8 7 6 5 4 3 2
 * 1 0" are caught, while dates ("12-10-2026 to 15-10-2026"), prices and PIN
 * codes are not.
 */
export const MASK = '•••';

export interface MaskResult {
  text: string;
  /** Something was hidden. */
  masked: boolean;
}

const MESSAGING_LINK =
  /\b(?:https?:\/\/)?(?:www\.)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|t\.me|telegram\.me|telegram\.dog)\/\S*/gi;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
/** "rahul at gmail dot com", "rahul [at] gmail (dot) co dot in". */
const SPELLED_EMAIL =
  /[a-z0-9._%+-]+\s*[([]?\s*at\s*[)\]]?\s*[a-z0-9-]+(?:\s*[([]?\s*dot\s*[)\]]?\s*[a-z0-9-]+)*\s*[([]?\s*dot\s*[)\]]?\s*(?:com|in|co|org|net|io|me)\b/gi;
/** name@okaxis, 9876543210@ybl, shop.name@paytm (after emails are gone). */
const UPI_ID = /[a-z0-9._-]+@[a-z]{2,}\b/gi;
/** Candidate digit runs: digits joined by up to 3 separator characters. */
const DIGIT_RUN = /\+?\d(?:[\s().-]{0,3}\d)*/g;
const NUMBER_WORD = '(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|double|triple)';
/** Eight or more spelled-out digits in a row: "nine eight seven six …". */
const SPELLED_NUMBER = new RegExp(`\\b${NUMBER_WORD}(?:[\\s,.-]+${NUMBER_WORD}){7,}\\b`, 'gi');

export function maskContacts(input: string): MaskResult {
  let masked = false;
  const replace = (text: string, pattern: RegExp) =>
    text.replace(pattern, () => {
      masked = true;
      return MASK;
    });

  let text = input;
  text = replace(text, MESSAGING_LINK);
  text = replace(text, EMAIL);
  text = replace(text, SPELLED_EMAIL);
  text = replace(text, UPI_ID);
  text = replace(text, SPELLED_NUMBER);
  text = text.replace(DIGIT_RUN, (run) => {
    const result = maskPhonesInRun(run);
    if (result !== run) masked = true;
    return result;
  });
  return { text, masked };
}

interface Group {
  start: number;
  end: number;
  digits: string;
}

/** Masks every phone number made of whole digit groups in [run]. */
function maskPhonesInRun(run: string): string {
  const groups: Group[] = [];
  for (const m of run.matchAll(/\d+/g)) {
    groups.push({ start: m.index, end: m.index + m[0].length, digits: m[0] });
  }
  const spans: [number, number][] = [];
  let g = 0;
  while (g < groups.length) {
    let digits = '';
    let found = -1;
    for (let k = g; k < groups.length && digits.length < 13; k++) {
      digits += groups[k]!.digits;
      if (isPhone(digits)) {
        found = k;
        break;
      }
    }
    if (found >= 0) {
      // Include a leading "+" (as in +91).
      const start =
        groups[g]!.start > 0 && run[groups[g]!.start - 1] === '+'
          ? groups[g]!.start - 1
          : groups[g]!.start;
      spans.push([start, groups[found]!.end]);
      g = found + 1;
    } else {
      g++;
    }
  }
  let out = run;
  for (const [start, end] of spans.reverse()) {
    out = out.slice(0, start) + MASK + out.slice(end);
  }
  return out;
}

/** An Indian mobile (6–9 then 9 digits), optionally with 91 / 0 / 091 in front, or a 0-prefixed landline. */
function isPhone(digits: string): boolean {
  const mobile = /^[6-9]\d{9}$/;
  if (mobile.test(digits)) return true;
  if (digits.length === 12 && digits.startsWith('91')) return mobile.test(digits.slice(2));
  if (digits.length === 13 && digits.startsWith('091')) return mobile.test(digits.slice(3));
  // 0 + 10 digits: a mobile with a trunk prefix, or an STD landline (e.g. 020 2567 8901).
  if (digits.length === 11 && digits.startsWith('0')) return /^[1-9]\d{9}$/.test(digits.slice(1));
  return false;
}
