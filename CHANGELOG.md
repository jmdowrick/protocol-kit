# Changelog

## 0.3.0 (2026-10-09)

- The editor tucks away the parameters a protocol sets to their value in the model, as a plain number, in every
  experiment and sub-experiment (`findParametersAtModelValues`, from the host's `getValue`, else `variables`). A line
  below the others counts them and shows or hides them; the document keeps them. One whose model value is unknown, one
  added or edited while the editor is open, and one an error or warning names stay shown.
- `readPredictionItem` checks a prediction item's held-out `std` as circulatory_autogen #536's head (7e9fdb55) does
  (`_held_out_std`): finite and above 0, one number for a constant, one or one per point for a series, which it
  expands. The prediction vectors now come from that commit, which PhLynx's exported scripts install.
- Outputs are grouped as CA names them for plotting (`nameItemForPlotting`): `item_name_for_plotting`, else
  `trace_name_for_plotting`, else the first operand, else `data_item_name`, legacy keys migrated. Before, an item
  without `item_name_for_plotting` was an output of its own.
- `listOutputs` marks an output with two items in one experiment (`hasRepeatedExperiment`); `updateOutput` leaves it
  as it is, as writing one item per experiment dropped the rest, and the editor won't edit it.
- The editor: clicking the Variable caption no longer clears the variable; an error all of an output's items have
  shows once; parameters are always offered, for their mean; a range field that reads as no number is refused.
  `NumberInput` emits `invalid`. The Sub-experiment field shows "The last of each experiment" when chosen, not blank,
  and a new output's form shows no problem until it has a variable or a name.

## 0.2.0 (2026-10-09)

- Outputs: `prediction_items` as a run's outputs, each a variable's trace or a feature of it (`max`, `min`, `mean`,
  `max_minus_min`, and their `*_in_range` forms over `start_frac` to `end_frac`), in the experiments and
  sub-experiment chosen. `addOutput`, `updateOutput` and `removeOutput` write one item per experiment, sharing
  `item_name_for_plotting`; `listOutputs` groups them back. Items with measured data (`value`, `std`, `data_type`,
  `obs_dt`) are validation data, listed but never changed; nothing here writes those keys.
- `readPredictionItemsAsCircAutogen`: prediction items read as circulatory_autogen #536 reads them, with its messages
  (closed keys, required keys and types, experiment and sub-experiment in range, data shapes, `operation_kwargs`
  without an operation, names unique across data and prediction items, references in `operation_kwargs`). Golden
  vectors from #536's own parser (`scripts/generate_prediction_vectors.py`, `tests/resources/prediction-vectors.json`)
  check it.
- `validatePredictionItems` checks each item on its own for the editor, and that each `*_in_range` window takes a
  sample at the run's `dt` (CA leaves its end out). `findPredictionItemLimits` warns that items with an operation or a
  sub-experiment need circulatory_autogen #536: released libcuflynx 0.7.3 and current CUFLynx reject them.
- The editor: an Outputs section (`ProtocolOutputsEditor`) below the protocol, to add, edit and remove outputs, with
  the host's variables (parameters only for a mean). `ProtocolEditor` takes `dt`.
- Publishing builds and tests the package first, and authenticates with an npm token. 0.1.1, which set this up, was
  never published.

## 0.1.0 (2026-10-09)

- The protocol core, extracted from PhLynx (`src/services/protocol/`): reading and writing obs_data, validation as
  circulatory_autogen does it, shape expansion, editing and preview.
- `resolveExperimentColour` moves here from PhLynx's chart series, and takes the palette to fall back on.
- Removing a sub-experiment renumbers prediction items that name one (`subexperiment_idx`), as it did data items, and
  removes those in it. `findObservationsAt` lists them too.
- `validateProtocolInfo` no longer warns that PhLynx ignores `offline_pre_time`: what a host ignores is its own
  warning (the editor's `warn`).
- The protocol editor, extracted from PhLynx (`ProtocolEditor`, `ProtocolCellEditor`, `InlineNumber`, `NumberInput`),
  independent of its host: it takes the model's variables as a plain list (`variables`), and optionally `getValue`,
  `confirm`, `palette` and `warn`. `VariablePicker` and `searchVariables` replace PhLynx's variable index for it.
