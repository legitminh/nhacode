import { distribute_color } from '@legitminh/keyflow';

/**
 * A distinct color for each pitch class 0–b, from Keyflow's color distribution:
 * the 12 hues are spread evenly and neighbouring semitones land far apart on the wheel.
 */
export function pitchColor(row: number): string {
  const hue = distribute_color(12, 3, row) ?? 0;
  return `hsl(${hue * 30} 70% 42%)`;
}
