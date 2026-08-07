import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import db

YEARS = list(range(2020, 2041))

due_cases = []
for year in YEARS:
    for month in range(1, 13):
        due_cases.append(f"{year}-{month:02d}-01")
    due_cases.append(f"{year}-12-20")
    due_cases.append(f"{year}-12-31")
    due_cases.append(f"{year}-01-02")
    due_cases.append(f"{year}-01-03")

for year in YEARS:
    for holiday in sorted(db.federal_holidays(year)):
        due_cases.append(holiday.isoformat())
        from datetime import timedelta

        due_cases.append((holiday - timedelta(days=1)).isoformat())
        due_cases.append((holiday + timedelta(days=1)).isoformat())

for fixed in ["2024-03-01", "2026-07-07", "2024-05-20", "2029-01-01", "2032-02-29", "2020-01-01", "2036-12-25"]:
    due_cases.append(fixed)

for period in [1, 7, 30, 60, 120]:
    for d in ["2024-01-01", "2024-07-04", "2024-11-28", "2025-12-31", "2030-06-19"]:
        due_cases.append({"date": d, "period": period})

holidays_by_year = {str(year): sorted(h.isoformat() for h in db.federal_holidays(year)) for year in YEARS}

normalize_cases = [
    ("", ""),
    ("2026-07-07", "2026-07-07"),
    ("07/07/2026", "2026-07-07"),
    ("7/7/2026", "2026-07-07"),
    ("2026/07/07", "2026-07-07"),
    ("2026-1-07", "2026-01-07"),
    (" 2026-07-07 ", "2026-07-07"),
]

phone_cases = [
    ("(406) 555-1234", "4065551234", "(406) 555-1234"),
    ("4065551234", "4065551234", "(406) 555-1234"),
    ("14065551234", "4065551234", "(406) 555-1234"),
    ("1-406-555-1234", "4065551234", "(406) 555-1234"),
    ("555-1234", "5551234", "555-1234"),
    ("", "", ""),
]

escape_cases = [
    ("a_b%c\\d", "a\\_b\\%c\\\\d"),
    ("plain", "plain"),
    ("100%", "100\\%"),
    ("\\", "\\\\"),
]

reference = {
    "due_cases": [c if isinstance(c, str) else {"date": c["date"], "period": c["period"]} for c in due_cases],
    "due_results": {},
    "holidays_by_year": holidays_by_year,
    "normalize_cases": normalize_cases,
    "normalize_results": {raw: db.normalize_date_input(raw) for raw, _ in normalize_cases},
    "phone_cases": phone_cases,
    "phone_results": {raw: [db.normalize_phone(raw), db.format_phone(raw)] for raw, _, _ in phone_cases},
    "escape_results": {raw: db.escape_like(raw) for raw, _ in escape_cases},
}

for case in due_cases:
    if isinstance(case, str):
        reference["due_results"][case] = db.calculate_due_date(case)
    else:
        reference["due_results"][f'{case["date"]}:{case["period"]}'] = db.calculate_due_date(case["date"], case["period"])

out = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "legacy-reference.json"
out.write_text(json.dumps(reference, indent=1, sort_keys=True), encoding="utf-8")
print(f"wrote {len(reference['due_results'])} due-date results to {out}")
