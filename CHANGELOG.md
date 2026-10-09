# Changelog

## 0.1.0 (unreleased)

- The protocol core, extracted from PhLynx (`src/services/protocol/`): reading and writing obs_data, validation as
  circulatory_autogen does it, shape expansion, editing and preview.
- `resolveExperimentColour` moves here from PhLynx's chart series, and takes the palette to fall back on.
- Removing a sub-experiment renumbers prediction items that name one (`subexperiment_idx`), as it did data items, and
  removes those in it. `findObservationsAt` lists them too.
