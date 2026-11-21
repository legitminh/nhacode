import { distribute_color } from '@legitminh/keyflow';

/**
 * A distinct color for each index 0–b, from Keyflow's color distribution:
 * the 12 hues are spread evenly and neighbouring indices land far apart on the wheel.
 */
export function pitchColor(row: number): string {
  const hue = distribute_color(12, 3, row) ?? 0;
  return `hsl(${hue * 30} 70% 42%)`;
}

/**
 * Everything is colored by octave: octave n (its sheet line, its digits and holds,
 * and its piano keys' text and borders) is index n; the origin line above octave 0 is 0.
 * The digit itself already names the note, so pitch gets no color hint.
 */
export function octaveLineColor(index: number): string {
  return pitchColor(index % 12);
}
