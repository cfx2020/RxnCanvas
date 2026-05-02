"""Input helpers shared by parser plugins."""

from __future__ import annotations

from pathlib import Path

from rxnflow.errors import RxnFlowError
from rxnflow.result import Result, err, ok

from .contracts import RawFile


def read_raw_text(raw_file: RawFile) -> Result[str]:
    if isinstance(raw_file.content, bytes):
        return ok(raw_file.content.decode("utf-8", errors="replace"))
    if isinstance(raw_file.content, str):
        return ok(raw_file.content)
    if raw_file.path is None:
        return err(
            RxnFlowError(
                code="invalid_input",
                message="RawFile must provide either content or path.",
                target=raw_file.id,
            )
        )

    path = Path(raw_file.path)
    if not path.is_file():
        return err(
            RxnFlowError(
                code="invalid_input",
                message="RawFile path does not exist or is not a file.",
                target=str(path),
            )
        )
    try:
        return ok(path.read_text(encoding="utf-8", errors="replace"))
    except OSError as exc:
        return err(
            RxnFlowError(
                code="invalid_input",
                message=f"Failed to read RawFile text: {exc}.",
                target=str(path),
            )
        )
