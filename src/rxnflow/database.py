"""SQLite source of truth for registered RxnFlow objects."""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
import sqlite3
from typing import Iterator


SCHEMA_STATEMENTS = [
    """
    create table if not exists task_run (
        task_run_id text primary key,
        task_dir text not null,
        task_type text not null,
        source_task_yaml_path text not null
    )
    """,
    """
    create table if not exists import_record (
        import_record_id text primary key,
        source_program text not null,
        source_path text not null,
        parser_name text not null,
        imported_at text not null
    )
    """,
    """
    create table if not exists result_record (
        result_record_id text primary key,
        source_kind text not null check (source_kind in ('task', 'import')),
        task_run_id text references task_run(task_run_id),
        import_record_id text references import_record(import_record_id),
        candidate_label text not null,
        registered_at text not null
    )
    """,
    """
    create table if not exists node (
        node_id text primary key,
        charge integer not null,
        multiplicity integer not null,
        origin_kind text not null,
        frozen_structure_path text not null
    )
    """,
    """
    create table if not exists calculation (
        calculation_id text primary key,
        node_id text not null references node(node_id),
        result_record_id text not null references result_record(result_record_id),
        method_label text not null,
        backend_label text not null,
        energy real not null,
        frequency_summary_json text not null,
        frozen_payload_path text not null
    )
    """,
    """
    create table if not exists report (
        report_id text primary key,
        report_dir text not null
    )
    """,
    """
    create table if not exists report_site (
        site_id text primary key,
        report_id text not null references report(report_id),
        label text not null
    )
    """,
    """
    create table if not exists report_point_binding (
        binding_id text primary key,
        report_id text not null references report(report_id),
        site_id text not null references report_site(site_id),
        calculation_id text not null references calculation(calculation_id),
        active integer not null check (active in (0, 1))
    )
    """,
    """
    create table if not exists report_edge (
        edge_id text primary key,
        report_id text not null references report(report_id),
        from_site_id text not null references report_site(site_id),
        to_site_id text not null references report_site(site_id),
        provenance_task_run_id text references task_run(task_run_id),
        note text not null default ''
    )
    """,
]


def initialize_database(db_path: str | Path) -> None:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    try:
        conn.execute("pragma foreign_keys = on")
        for statement in SCHEMA_STATEMENTS:
            conn.execute(statement)
        conn.commit()
    finally:
        conn.close()


@contextmanager
def connect_project_database(db_path: str | Path) -> Iterator[sqlite3.Connection]:
    path = Path(db_path)
    initialize_database(path)
    conn = sqlite3.connect(path)
    conn.execute("pragma foreign_keys = on")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
