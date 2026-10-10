/**
 * The columns of a data item the data items editor can show, each with the fields of a row (readDataItem) it shows and
 * edits, and the presets a host picks from: every column for a calibration tool, or a summary that lists the items.
 */

// Each column, in the order the editor shows them.
export const DATA_ITEM_COLUMNS = [
  { key: 'name', label: 'Name', fields: ['name'] },
  { key: 'variable', label: 'Variable', fields: ['operands'] },
  { key: 'experiment', label: 'Experiment', fields: ['experiment'] },
  { key: 'subexperiment', label: 'Sub-experiment', fields: ['subexperiment'] },
  { key: 'dataType', label: 'Data type', fields: ['dataType'] },
  { key: 'unit', label: 'Unit', fields: ['unit'] },
  { key: 'operation', label: 'Operation', fields: ['operation', 'operationKwargs'] },
  { key: 'value', label: 'Value and std', fields: ['value', 'std', 'obsDt', 'probDistParams'] },
  { key: 'weight', label: 'Weight', fields: ['weight'] },
  { key: 'cost', label: 'Cost', fields: ['costType', 'costKwargs'] },
  { key: 'plot', label: 'Plot', fields: ['plotType', 'plotColor', 'traceName', 'itemName'] },
  { key: 'source', label: 'Source', fields: ['source'] },
  { key: 'comment', label: 'Comment', fields: ['comment'] },
]
const KEYS = DATA_ITEM_COLUMNS.map(({ key }) => key)

// 'all' for a host that calibrates (CUFLynx); 'summary' for one that lists what is measured (PhLynx).
export const DATA_ITEM_COLUMN_PRESETS = {
  all: KEYS,
  summary: ['name', 'variable', 'experiment', 'subexperiment'],
}

/**
 * Reads the columns a host asks for: a preset's name, or a list of keys.
 *
 * @param {string|string[]} columns
 * @returns {string[]} The keys known, in the editor's order; a preset unknown is 'all'.
 */
export function resolveDataItemColumns(columns) {
  const asked = Array.isArray(columns) ? columns : (DATA_ITEM_COLUMN_PRESETS[columns] ?? DATA_ITEM_COLUMN_PRESETS.all)
  return KEYS.filter((key) => asked.includes(key))
}

/**
 * Whether columns are only the summary's, which list the items without what a calibration needs of them, so the
 * editor shows them read-only unless the host says otherwise.
 *
 * @param {string[]} keys - As resolveDataItemColumns gives.
 * @returns {boolean}
 */
export const isSummaryColumns = (keys) => keys.every((key) => DATA_ITEM_COLUMN_PRESETS.summary.includes(key))
