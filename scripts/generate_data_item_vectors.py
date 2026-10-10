"""
Writes tests/resources/data-item-vectors.json: what circulatory_autogen's parser (#536 and later) makes of data_items,
good and bad, and of every *_obs_data.json fixture; what its operation_kwargs and cost_kwargs checks say of keys given
to its own funcs; and its vocabularies (data types, plot types, the default cost type, its operations and cost funcs),
for protocol-kit's port (src/core/dataItemValidation.js, src/core/dataItemVocabulary.js) to be checked against. Run by
hand, not in CI, with a Python that has that circulatory_autogen's libcuflynx installed:

    python scripts/generate_data_item_vectors.py [path/to/circulatory_autogen]

The path is only read for the commit it records. NaN, which JSON has no word for, is written as null.
"""
import copy
import inspect
import json
import math
import os
import subprocess
import sys
import warnings

from libcuflynx.funcs import cost_funcs_user
from libcuflynx.param_id.cost_kwargs import RESERVED_COST_KWARGS, check_cost_kwargs, get_cost_kwarg_spec, ground_truth_param_name
from libcuflynx.param_id.differentiable import is_circulatory_differentiable
from libcuflynx.param_id.operation_funcs import (RESERVED_OPERATION_KWARGS, check_operation_kwargs, get_operation_funcs_dict_for_mode,
                                                 get_operation_kwarg_spec)
from libcuflynx.parsers.PrimitiveParsers import ObsAndParamDataParser
from libcuflynx.utilities import obs_data_helpers

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
RESOURCES = os.path.join(ROOT, "tests", "resources")
CA = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "..", "circulatory_autogen"))

# Two experiments, of two and one sub-experiments, and a prediction item to share names with.
PROTOCOL_INFO = {"pre_times": [0, 0], "sim_times": [[1, 2], [3]], "params_to_change": {}}
PREDICTION_ITEMS = [{"data_item_name": "V_trace", "operands": ["membrane/V"], "unit": "mV"}]
# What the port reads into, of CA's gt_df.
KEYS = ["data_item_name", "data_type", "unit", "weight", "operands", "operation", "trace_name_for_plotting", "item_name_for_plotting",
        "operation_kwargs", "cost_kwargs", "value", "std", "experiment_idx", "subexperiment_idx", "plot_type", "plot_color", "cost_type",
        "obs_dt", "prob_dist_params", "source", "comment"]


def item(name="V_peak", **fields):
    return {"data_item_name": name, "data_type": "constant", "unit": "mV", "operands": ["membrane/V"], "operation": "max", "value": 20.5,
            "std": 1.5, **fields}


def series(name="V_series", **fields):
    return {"data_item_name": name, "data_type": "series", "unit": "mV", "operands": ["membrane/V"], "value": [1, 2, 3], "std": 0.5,
            "obs_dt": 0.1, **fields}


def without(entry, *keys):
    return {key: value for key, value in entry.items() if key not in keys}


CASES = [
    # Read as CA reads them.
    ("a constant", [item()]),
    ("no data items", []),
    ("defaults filled in", [without(item(), "operation")]),
    ("labels given", [item(trace_name_for_plotting="Voltage", item_name_for_plotting="V peak")]),
    ("the item label from the operation", [item(trace_name_for_plotting="Voltage")]),
    ("an operation spelled as none", [item(operation="None"), item("b", operation=" null ")]),
    ("no operands, named by the item", [item(operands=[], operation="calculate_two_observable_difference",
                                             operation_kwargs={"subtract_from": "a", "subtract_this": "b"})]),
    ("every experiment and sub-experiment", [item("a", experiment_idx=0, subexperiment_idx=1), item("b", experiment_idx=1, subexperiment_idx=0)]),
    ("indices out of range, which CA reads", [item(experiment_idx=5, subexperiment_idx=7)]),
    ("a weight, cost type and kwargs", [item(weight=2, cost_type="gaussian_MLE_robust", cost_kwargs={"p_outlier": 0.1})]),
    ("weights on some items only", [item("a"), item("b", weight=0.5)]),
    ("plot type, colour, source and comment", [item(plot_type="vertical", plot_color="tab:red", source="Smith 2020", comment="noisy")]),
    ("a source of files", [item(source={"value_path": "x.npy"})]),
    ("a series", [series()]),
    ("a series with a std per value", [series(std=[0.5, 0.6, 0.7])]),
    ("a series with one std in a list", [series(std=[0.25])]),
    ("a timeseries", [series(data_type="timeseries", plot_type="timeseries")]),
    ("a constant and a series", [item(), series()]),
    ("a distribution", [without(item(cost_type="kernel_density_estimation", prob_dist_params={"samples": [1, 2, 3]}), "value", "std")]),
    ("a frequency", [item(data_type="frequency", operation=None, value=[1, 2], std=[1, 1], frequencies=[1, 2], phase=[0, 0])]),
    ("the legacy variable key", [without(item(variable="V_peak"), "data_item_name")]),
    ("the legacy name_for_plotting key", [item(name_for_plotting="V")]),
    ("nulls take the defaults", [item(weight=None, operation=None, operation_kwargs=None, cost_type=None, plot_type=None)]),
    ("value of true", [item(value=True)]),
    # Refused.
    ("an unknown key", [item(colour="r", variable_name="x")]),
    ("no unit", [without(item(), "unit")]),
    ("no data_type", [without(item(), "data_type")]),
    ("no name nor operands", [without(item(), "data_item_name", "operands")]),
    ("no data_type on one item", [item("a"), without(item("b"), "data_type")]),
    ("an unknown data_type", [item(data_type="scalar")]),
    ("the removed prob_dist", [item(data_type="prob_dist")]),
    ("no value", [without(item(), "value")]),
    ("no value nor std", [without(item(), "value", "std"), without(item("b"), "std")]),
    ("a null value", [item(value=None)]),
    ("a unit not a string", [item(unit=1)]),
    ("operands not a list", [item(operands="membrane/V")]),
    ("several wrong types", [item(unit=1, weight="2", operation_kwargs=[1], cost_type=3, plot_type=False)]),
    ("a fractional experiment_idx", [item(experiment_idx=1.5)]),
    ("an experiment_idx of true", [item(experiment_idx=True)]),
    ("an experiment_idx on some items only", [item("a"), item("b", experiment_idx=1)]),
    ("a subexperiment_idx on some items only", [item("a", subexperiment_idx=1), item("b")]),
    ("an experiment_idx null on one item", [item("a", experiment_idx=1), item("b", experiment_idx=None)]),
    ("an experiment_idx string", [item("a", experiment_idx="1"), item("b")]),
    ("a constant of a list", [item(value=[1, 2])]),
    ("a constant with a list of stds", [item(std=[1])]),
    ("a series of one number", [series(value=1.5)]),
    ("a series without std", [without(series(), "std")]),
    ("a series with a null std", [series(std=None)]),
    ("a series without values", [without(series(), "value")]),
    ("a series of no values", [series(value=[])]),
    ("a series with a std of 0", [series(std=0)]),
    ("a series with a negative std", [series(std=-1)]),
    ("a series with one std of 0 in a list", [series(std=[0])]),
    ("a series with stds of another length", [series(std=[1, 2])]),
    ("a series with a negative std in a list", [series(std=[1, -1, 1])]),
    ("a series with a std of a string", [series(std="1")]),
    ("a series without obs_dt", [without(series(), "obs_dt")]),
    ("a series with a value and a file", [series(value_path="v.npy", t_path="t.npy")]),
    ("a legacy key and its replacement", [item(variable="V_peak")]),
    ("a repeated name", [item("a"), item("b"), item("a")]),
    ("a name of a prediction item", [item("V_trace")]),
    ("names repeated in both lists", [item("V_trace"), item("V_trace"), item("z"), item("z")]),
]

# operation_kwargs given to CA's own operations: (operation, operands, kwargs).
OPERATION_KWARG_CASES = [
    ("max_in_range", 1, {"start_frac": 0.1, "end_frac": 0.9}),
    ("max_in_range", 1, {"start": 0.1}),
    ("max_in_range", 1, {"star_frac": 0.1}),
    ("max_in_range", 1, {"series_output": True}),
    ("max_in_range", 1, {"x": 1}),
    ("max", 1, {"start_frac": 0.1}),
    ("calc_spike_count_windowed", 2, {"spike_min_thresh": 0, "end_fract": 0.5}),
    ("calc_spike_count_windowed", 2, {"V": 1}),
    ("calc_spike_count_windowed", 1, {"V": 1}),
    ("calculate_two_observable_difference", 0, {"subtract_from": "a", "subtract_this": "b"}),
    ("calculate_two_observable_difference", 0, {"subtract": "a"}),
    ("division", 2, {"x1": 1}),
    ("V_plateau", 2, {"dV_dt_thres": 1}),
    ("mean_in_range_fraction_change_from_initial_range", 1, {"init_range_end": 0.2}),
]
# cost_kwargs given to CA's own cost funcs: (cost_type, kwargs).
COST_KWARG_CASES = [
    ("gaussian_MLE_robust", {"p_outlier": 0.1}),
    ("gaussian_MLE_robust", {"p_outliers": 0.1}),
    ("gaussian_MLE_robust", {"std": 1}),
    ("gaussian_MLE_robust", {"weight": 1}),
    ("gaussian_MLE_robust", {"output": 1}),
    ("gaussian_MLE_robust", {"desired_mean": 1}),
    ("gaussian_MLE", {"tolerance": 1}),
    ("MSE", {"anything": 1}),
    ("MSE", {"std": 1}),
    ("kernel_density_estimation", {"bandwidth": 0.5}),
    ("kernel_density_estimation", {"prob_dist_params": {}}),
    ("poisson_MLE", {"background": 0.1}),
]


def clean(value):
    """A gt_df cell as JSON: NaN as null, numpy's scalars and arrays as Python's."""
    if hasattr(value, "tolist"):
        value = value.tolist()
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, list):
        return [clean(entry) for entry in value]
    if isinstance(value, dict):
        return {key: clean(entry) for key, entry in value.items()}
    return value


def parse(data_items, document=None):
    """Parses data items as CA does, in a document of their own, or in the one given."""
    document = copy.deepcopy(document) if document is not None else {"protocol_info": PROTOCOL_INFO, "prediction_items": PREDICTION_ITEMS}
    document = {**copy.deepcopy(document), "data_items": copy.deepcopy(data_items)}
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            gt_df = ObsAndParamDataParser().parse_obs_data_json(obs_data_dict=document)["gt_df"]
    except ValueError as error:
        return {"error": str(error)}
    rows = [{key: clean(row.get(key)) for key in KEYS} for row in gt_df.to_dict(orient="records")]
    return {"result": rows}


def read_fixtures():
    fixtures = {}
    for name in sorted(os.listdir(RESOURCES)):
        if not name.endswith("_obs_data.json"):
            continue
        with open(os.path.join(RESOURCES, name)) as f:
            document = json.load(f)
        if isinstance(document, dict) and "data_items" in document:
            fixtures[name] = parse(document["data_items"], document)
    return fixtures


def check(checker, *args):
    try:
        checker(*args)
    except ValueError as error:
        return {"error": str(error)}
    return {"error": None}


def kwarg_type(default, takes_no_operands):
    """The input a kwarg takes in an editor, from its default: with none, another item's name for an operation of no
    operands (as CUFLynx's obs_options has it), else a number."""
    if isinstance(default, bool):
        return "boolean"
    if isinstance(default, (int, float)):
        return "number"
    if isinstance(default, str):
        return "string"
    return "data_item" if takes_no_operands else "number"


def read_kwargs(func, names, takes_no_operands=False):
    parameters = inspect.signature(func).parameters
    kwargs = []
    for name in names:
        default = parameters[name].default
        default = None if default is inspect.Parameter.empty else default
        kwargs.append({"name": name, "default": default if isinstance(default, (bool, int, float, str)) or default is None else None,
                       "type": kwarg_type(default, takes_no_operands)})
    return kwargs


def read_vocabulary():
    operations = []
    for name, func in sorted(get_operation_funcs_dict_for_mode("numpy").items()):
        accepted, from_operands, accepts_any = get_operation_kwarg_spec(func)
        tunable = [key for key in accepted if key not in from_operands and key not in RESERVED_OPERATION_KWARGS]
        operations.append({"name": name, "operands": from_operands, "kwargs": read_kwargs(func, tunable, not from_operands),
                           "acceptsAny": accepts_any, "differentiable": bool(is_circulatory_differentiable(func))})
    metadata = cost_funcs_user.cost_func_metadata("numpy")
    cost_types = []
    for name, func in sorted(cost_funcs_user.get_cost_funcs_dict_for_mode("numpy").items()):
        accepted, positional, accepts_any = get_cost_kwarg_spec(func)
        tunable = [key for key in accepted if key not in positional and key not in RESERVED_COST_KWARGS]
        flags = metadata.get(name) or {}
        cost_types.append({"name": name, "positional": positional, "kwargs": read_kwargs(func, tunable), "acceptsAny": accepts_any,
                           "groundTruth": "distribution" if ground_truth_param_name(func) == "prob_dist_params" else "value",
                           "isMLE": bool(flags.get("is_MLE")), "isCombiner": bool(flags.get("is_combiner")),
                           "differentiable": bool(flags.get("differentiable"))})
    return {
        "dataTypes": obs_data_helpers.get_valid_data_types(),
        "plotTypes": obs_data_helpers.get_valid_plot_types(),
        "defaultCostType": obs_data_helpers.get_default_cost_type(),
        "operations": operations,
        "costTypes": cost_types,
    }


def main():
    commit = subprocess.run(["git", "-C", CA, "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
    operation_funcs = get_operation_funcs_dict_for_mode("numpy")
    cost_funcs = cost_funcs_user.get_cost_funcs_dict_for_mode("numpy")
    vectors = {
        "source": {"repository": "circulatory_autogen", "commit": commit},
        "protocol_info": PROTOCOL_INFO,
        "prediction_items": PREDICTION_ITEMS,
        "cases": [{"name": name, "data_items": items, **parse(items)} for name, items in CASES],
        "fixtures": read_fixtures(),
        "operation_kwargs": [{"operation": operation, "operands": operands, "kwargs": kwargs,
                              **check(check_operation_kwargs, kwargs, operation_funcs[operation], operation, "item", operands)}
                             for operation, operands, kwargs in OPERATION_KWARG_CASES],
        "cost_kwargs": [{"cost_type": cost_type, "kwargs": kwargs, **check(check_cost_kwargs, kwargs, cost_funcs[cost_type], cost_type, "item")}
                        for cost_type, kwargs in COST_KWARG_CASES],
        "vocabulary": read_vocabulary(),
    }
    with open(os.path.join(RESOURCES, "data-item-vectors.json"), "w") as f:
        json.dump(vectors, f, indent=1)
        f.write("\n")
    print(f"Wrote {len(CASES)} data item, {len(vectors['fixtures'])} fixture and "
          f"{len(OPERATION_KWARG_CASES) + len(COST_KWARG_CASES)} kwargs vectors from CA {commit}.")


if __name__ == "__main__":
    main()
