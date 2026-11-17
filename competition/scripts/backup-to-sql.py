"""Build a seed SQL file from an organizer export for a fresh, pre-migrated database."""
import argparse
import json
from pathlib import Path

COLUMNS = {
    "cup_tournament": "id name season state configuration",
    "cup_team": "id tournament_id name pool crest kit",
    "cup_player": "id team name shirt position duties active",
    "cup_match": "id tournament_id date time pool place home away",
    "cup_report": "match_id revision submission actor created_at status home away score half_time penalties yellow red",
    "cup_event": "match_id revision id team player assist fraction minute stoppage kind notes verified",
    "cup_shootout": "pool revision team_order actor created_at",
}

def literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, int):
        return str(int(value))
    if isinstance(value, str) and "\x00" not in value:
        return "'" + value.replace("'", "''") + "'"
    raise ValueError("Tipo non ammesso nel backup")

def convert(snapshot, tournament):
    if snapshot["version"] != 1 or snapshot["tournament"] != tournament:
        raise ValueError("Versione del backup o torneo non corrispondente")
    tables = snapshot["tables"]
    if set(tables) != set(COLUMNS) or [row["id"] for row in tables["cup_tournament"]] != [tournament]:
        raise ValueError("Backup incompleto")
    for table, fields in COLUMNS.items():
        columns = fields.split()
        for row in tables[table]:
            values = ", ".join(literal(row[key]) for key in columns)
            yield f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({values});"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("tournament", choices=["winter", "prestige"])
    parser.add_argument("backup", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    snapshot = json.loads(args.backup.read_text(encoding="utf-8"))
    sql = "\n".join(convert(snapshot, args.tournament)) + "\n"
    with args.output.open("x", encoding="utf-8") as output:
        output.write(sql)

if __name__ == "__main__":
    main()
