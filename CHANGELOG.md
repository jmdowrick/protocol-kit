# Changelog

## 0.2.0 (unreleased)

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

## 0.1.0 (unreleased)

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
