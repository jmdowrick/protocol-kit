"""
Writes tests/resources/prediction-vectors.json: what circulatory_autogen's parser (#536 and later) makes of
prediction_items, good and bad, and of every *_obs_data.json fixture with them, for protocol-kit's port (src/core/predictionValidation.js) to be checked against.
Run by hand, not in CI, with a Python that has that circulatory_autogen's libcuflynx installed:

    python scripts/generate_prediction_vectors.py [path/to/circulatory_autogen]

The path is only read for the commit it records.
"""
import copy
import json
import os
import subprocess
import sys
import warnings

from libcuflynx.parsers.PrimitiveParsers import ObsAndParamDataParser

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
RESOURCES = os.path.join(ROOT, "tests", "resources")
CA = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "..", "circulatory_autogen"))

# Three experiments of two, one and three sub-experiments, and one data item to share names with.
PROTOCOL_INFO = {"pre_times": [0, 0, 0], "sim_times": [[1, 2], [3], [1, 1, 1]], "params_to_change": {}}
DATA_ITEMS = [{"data_item_name": "V_rest", "data_type": "constant", "unit": "mV", "operands": ["membrane/V"], "operation": "mean", "value": -80, "std": 1}]
# What the port reads into, of CA's prediction_info.
KEYS = ["operands", "units", "data_item_names", "trace_names_for_plotting", "item_names_for_plotting", "experiment_idxs", "subexperiment_idxs",
        "data_types", "values", "stds", "obs_dts", "operations", "operation_kwargs"]


def item(name="out", **fields):
    return {"data_item_name": name, "operands": ["membrane/V"], "unit": "mV", **fields}


def feature(name, operation="max", **fields):
    return item(name, operation=operation, **fields)


CASES = [
    # Read as CA reads them.
    ("a trace", [item()]),
    ("a trace of a sub-experiment", [item(experiment_idx=2, subexperiment_idx=1)]),
    ("features in a range, across experiments", [feature("I_peak_e0", "min_in_range", operation_kwargs={"start_frac": 0, "end_frac": 0.2}, item_name_for_plotting="I_peak", subexperiment_idx=1),
                                                  feature("I_peak_e1", "min_in_range", operation_kwargs={"start_frac": 0, "end_frac": 0.2}, item_name_for_plotting="I_peak", experiment_idx=1)]),
    ("labels given", [item(trace_name_for_plotting="Voltage", item_name_for_plotting="V")]),
    ("operation spelled as none", [item(operation="None"), item("b", operation=""), item("c", operation=" null ")]),
    ("validation data", [feature("V_peak", data_type="constant", value=20.5, std=1.5)]),
    ("a series", [item(data_type="series", value=[1, 2, 3], std=[0.5, 0.5, 0.5], obs_dt=0.1)]),
    ("a series with one std", [item(data_type="series", value=[1, 2, 3], std=[0.5], obs_dt=0.1)]),
    ("a series without values", [item(data_type="series")]),
    ("a series with a std of one number", [item(data_type="series", value=[1, 2, 3], std=0.5, obs_dt=0.1)]),
    ("a std without a value", [feature("V_peak", data_type="constant", std=0)]),
    ("the legacy variable key", [{"variable": "membrane/V", "unit": "mV"}]),
    ("the legacy name_for_plotting key", [item(name_for_plotting="V")]),
    ("nulls take the defaults", [item(experiment_idx=None, subexperiment_idx=None, trace_name_for_plotting=None, operation=None, operation_kwargs=None)]),
    ("no operands", [{"data_item_name": "membrane/V", "unit": "mV"}]),
    ("empty operands", [{"data_item_name": "membrane/V", "operands": [], "unit": "mV"}]),
    ("a reference to an earlier feature", [feature("peak"), feature("rel", "ratio", operation_kwargs={"of": "peak"})]),
    ("an experiment_idx of true", [item(experiment_idx=True)]),
    ("kwargs that aren't references", [feature("a", "max_in_range", operation_kwargs={"start_frac": 0.5, "end_frac": 1, "label": "nothing"})]),
    # Refused.
    ("not a list", {"out": item()}),
    ("an entry not a dict", [item(), 3]),
    ("an unknown key", [item(colour="r", weight=1)]),
    ("no unit", [{"data_item_name": "out", "operands": ["membrane/V"]}]),
    ("no name nor operands", [{"unit": "mV"}]),
    ("a null name", [item(data_item_name=None)]),
    ("a unit not a string", [item(unit=1)]),
    ("operands not a list", [item(operands="membrane/V")]),
    ("several wrong types", [item(unit=1, experiment_idx="0", operation_kwargs=[1], value="x")]),
    ("a fractional experiment_idx", [item(experiment_idx=1.5)]),
    ("an experiment out of range", [item(), item("b", experiment_idx=3)]),
    ("a negative experiment", [item(experiment_idx=-1)]),
    ("a sub-experiment out of range", [item(subexperiment_idx=2)]),
    ("a negative sub-experiment", [item(experiment_idx=2, subexperiment_idx=-1)]),
    ("a value without data_type", [item(value=1.5)]),
    ("an unknown data_type", [item(data_type="timeseries")]),
    ("a constant of a list", [item(data_type="constant", value=[1, 2])]),
    ("a constant with a list of stds", [item(data_type="constant", value=1.5, std=[1])]),
    ("a series of one number", [item(data_type="series", value=1.5, obs_dt=0.1)]),
    ("a series with stds of another length", [item(data_type="series", value=[1, 2, 3], std=[1, 2], obs_dt=0.1)]),
    ("a series without obs_dt", [item(data_type="series", value=[1, 2])]),
    ("a constant with a std of 0", [feature("V_peak", data_type="constant", value=20.5, std=0)]),
    ("a constant with a negative std", [feature("V_peak", data_type="constant", value=20.5, std=-1.5)]),
    ("a series with a negative std", [item(data_type="series", value=[1, 2, 3], std=[0.5, -0.5, 0.5], obs_dt=0.1)]),
    ("a series with one std of 0", [item(data_type="series", value=[1, 2, 3], std=[0], obs_dt=0.1)]),
    ("a series of rows with a std per row", [item(data_type="series", value=[[1, 2], [3, 4]], std=[1, 1], obs_dt=0.1)]),
    ("kwargs without an operation", [item(operation_kwargs={"start_frac": 0.5})]),
    ("kwargs with an operation spelled as none", [item(operation="none", operation_kwargs={"start_frac": 0.5})]),
    ("a legacy key and its replacement", [item(variable="membrane/V")]),
    ("a repeated name", [item("a"), item("b"), item("a")]),
    ("a name of a data item", [item("V_rest")]),
    ("names repeated in both lists", [item("V_rest"), item("V_rest"), item("z"), item("z")]),
    ("a reference to a data item", [feature("a", "ratio", operation_kwargs={"of": "V_rest"})]),
    ("a reference to a later item", [feature("a", "ratio", operation_kwargs={"of": "b"}), feature("b")]),
    ("a reference to itself", [feature("a", "ratio", operation_kwargs={"of": "a"})]),
    ("a reference to a trace", [item("a"), feature("b", "ratio", operation_kwargs={"of": "a"})]),
    ("a reference to a series", [feature("a", data_type="series"), feature("b", "ratio", operation_kwargs={"of": "a"})]),
]


def parse(prediction_items, document=None):
    """Parses prediction items as CA does, in a document of their own, or in the one given."""
    document = copy.deepcopy(document) if document is not None else {"protocol_info": PROTOCOL_INFO, "data_items": DATA_ITEMS}
    document = {**copy.deepcopy(document), "prediction_items": copy.deepcopy(prediction_items)}
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            info = ObsAndParamDataParser().parse_obs_data_json(obs_data_dict=document)["prediction_info"]
    except ValueError as error:
        return {"error": str(error)}
    return {"result": {key: info[key] for key in KEYS}}


def read_fixtures():
    fixtures = {}
    for name in sorted(os.listdir(RESOURCES)):
        if not name.endswith("_obs_data.json"):
            continue
        with open(os.path.join(RESOURCES, name)) as f:
            document = json.load(f)
        if isinstance(document, dict) and "prediction_items" in document:
            fixtures[name] = parse(document["prediction_items"], document)
    return fixtures


def main():
    commit = subprocess.run(["git", "-C", CA, "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
    vectors = {
        "source": {"repository": "circulatory_autogen", "commit": commit},
        "protocol_info": PROTOCOL_INFO,
        "data_items": DATA_ITEMS,
        "cases": [{"name": name, "prediction_items": items, **parse(items)} for name, items in CASES],
        "fixtures": read_fixtures(),
    }
    with open(os.path.join(RESOURCES, "prediction-vectors.json"), "w") as f:
        json.dump(vectors, f, indent=1)
        f.write("\n")
    print(f"Wrote {len(CASES)} prediction item and {len(vectors['fixtures'])} fixture vectors from CA {commit}.")


if __name__ == "__main__":
    main()
