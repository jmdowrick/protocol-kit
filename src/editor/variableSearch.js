/**
 * Searching the host's list of its model's variables, each named as a protocol names it (`component/variable`), for
 * one search box across the whole model.
 */

// The kinds of variable a protocol can set: parameters, which the model holds constant.
export const SETTABLE_KINDS = new Set(['constant', 'global_constant'])

/**
 * Checks whether a protocol can set a variable.
 *
 * @param {{kind: string}} variable
 * @returns {boolean}
 */
export const isSettable = (variable) => SETTABLE_KINDS.has(variable?.kind)

/**
 * Splits a variable's name into its component and its own name.
 *
 * @param {string} name - `component/variable`, or a name without a component.
 * @returns {{component: string, name: string}} The component is '' for a name without one.
 */
export function splitVariableName(name) {
  const separator = name.indexOf('/')
  return separator < 0 ? { component: '', name } : { component: name.slice(0, separator), name: name.slice(separator + 1) }
}

/**
 * Searches the variables: every word of the query must appear in a variable's name or label, in any order ("na g"
 * finds `Na_channel/g_Na`). Exact variable names come first, then names starting with a word, then shorter names.
 *
 * @param {Array<{name: string, label?: string}>} variables - The host's, as the editor's `variables` prop.
 * @param {string} query
 * @param {Object} [options]
 * @param {Function} [options.filter] - Keeps a variable, such as only those a protocol can set.
 * @param {number} [options.limit=200]
 * @returns {Array<Object>} The variables given, in order of match.
 */
export function searchVariables(variables, query, { filter = () => true, limit = 200 } = {}) {
  const words = (query ?? '').toLowerCase().split(/[\s/]+/).filter(Boolean)
  const scored = []
  for (const variable of variables ?? []) {
    if (!variable?.name || !filter(variable)) continue
    const text = `${variable.name} ${variable.label ?? ''}`.toLowerCase()
    if (!words.every((word) => text.includes(word))) continue
    const name = splitVariableName(variable.name).name.toLowerCase()
    const rank = words.some((word) => name === word) ? 0 : words.some((word) => name.startsWith(word)) ? 1 : 2
    scored.push({ variable, rank })
  }
  scored.sort((a, b) => a.rank - b.rank || a.variable.name.length - b.variable.name.length || a.variable.name.localeCompare(b.variable.name))
  return scored.slice(0, limit).map(({ variable }) => variable)
}
