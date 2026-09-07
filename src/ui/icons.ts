import type { LevelId } from '../game/types'

const paths: Record<LevelId | 'sound' | 'mute' | 'pause' | 'heart', string> = {
  snowboard:
    '<path d="m4 18 14-8M3 17c-2 4 3 6 5 3L20 9c3-3 0-6-3-3M11 5l3 3-3 4 4 3M10 12l-3 3"/><circle cx="12" cy="3" r="1.5"/>',
  skateboard:
    '<path d="M3 13c0 3 2 4 5 4h9c3 0 4-2 4-4M7 14l3-6 4 2 3 4M10 8l3-4"/><circle cx="7" cy="20" r="1"/><circle cx="17" cy="20" r="1"/>',
  rollerblade:
    '<path d="M6 3h7v8l6 3v3H5V8h4M5 7h8M5 11h8"/><circle cx="6" cy="21" r="1"/><circle cx="12" cy="21" r="1"/><circle cx="18" cy="21" r="1"/>',
  gokart:
    '<path d="m5 14 3-4h8l3 4M5 14h14v4H5zM9 7h6M12 7v3M2 12v8M22 12v8M2 16h3m14 0h3"/>',
  boat: '<path d="m2 13 3 6h13l4-6H2Zm5 0 2-7h6l3 7M3 22l3-1 3 1 3-1 3 1 3-1 3 1M10 6V3"/>',
  surf: '<path d="M20 3C9 3 2 10 4 20c10 2 17-5 16-17ZM5 19 17 7M2 23l3-4"/>',
  car: '<path d="m3 12 3-7h12l3 7v7H3v-7Zm1 0h16M7 16h2m6 0h2M5 19v3m14-3v3M8 5V2h8v3"/>',
  sound:
    '<path d="M3 9h4l5-5v16l-5-5H3V9Zm13-1c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
  mute: '<path d="M3 9h4l5-5v16l-5-5H3V9Zm13 0 6 6m0-6-6 6"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  heart: '<path d="M12 21 3 12C-3 5 7-1 12 6 17-1 27 5 21 12l-9 9Z"/>',
}
export function icon(name: keyof typeof paths): string {
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`
}
