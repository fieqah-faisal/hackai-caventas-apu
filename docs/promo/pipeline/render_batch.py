"""Render a scenario batch consistent with the case's stored action results.

Same logic the evaluation harness uses (scenarios/conditions.py): later
evidence depends on which actions ran, and when (simulated time).
Usage: render_batch.py <backend_dir> <case_id> <batch_no> <out_file>
"""
import json
import sys
import urllib.request

sys.path.insert(0, sys.argv[1])
from scenarios.conditions import render_batch  # noqa: E402

case_id, batch_no, out = sys.argv[2], int(sys.argv[3]), sys.argv[4]
scenario = json.load(open(f"{sys.argv[1]}/scenarios/sc01_infostealer/evaluator_only/scenario.json"))
results = json.load(urllib.request.urlopen(f"http://127.0.0.1:8000/cases/{case_id}/action-results"))
evidence = json.load(urllib.request.urlopen(f"http://127.0.0.1:8000/cases/{case_id}/evidence"))
revealed = {(e.get("fields") or {}).get("record_id") for e in evidence}
records, branch = render_batch(scenario, batch_no, results, revealed)
json.dump(records, open(out, "w"), indent=2)
print(f"batch {batch_no}: {len(records)} records, branch={branch}")
