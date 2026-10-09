/**
 * Colours experiments as their protocol's experiment_colors name them, the way CA plots them.
 */

/** The palette experiments without a colour of their own are coloured from, by place (PhLynx's light series colours). */
export const EXPERIMENT_PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']

/** Matplotlib's colour letters, as CA's experiment_colors use them. */
export const MATPLOTLIB_COLOURS = { r: '#e34948', b: '#2a78d6', g: '#1baf7a', m: '#e87ba4', c: '#17becf', y: '#eda100', k: '#52514e' }

/**
 * Colours an experiment as its protocol does (a matplotlib colour letter or a '#' hex colour, with or without alpha),
 * or by its place when it gives none that can be read.
 *
 * @param {string|null|undefined} colour - From experiment_colors.
 * @param {number} index - The experiment's place, from 0.
 * @param {string[]} [palette] - The colours by place, for an experiment without one.
 * @returns {string} '#rgb', '#rgba', '#rrggbb' or '#rrggbbaa'.
 */
export function resolveExperimentColour(colour, index, palette = EXPERIMENT_PALETTE) {
  if (colour && MATPLOTLIB_COLOURS[colour]) return MATPLOTLIB_COLOURS[colour]
  if (colour && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(colour)) return colour
  return palette[index % palette.length]
}
