"""Chemical object registration for fixture data."""

from __future__ import annotations

from .errors import RxnFlowError
from .models import ChemicalObject, ChemicalObjectDraft, Provenance
from .project import FIXTURE_TIME
from .result import Result, err, ok


def register_fixture_objects(
    drafts: tuple[ChemicalObjectDraft, ...],
) -> Result[tuple[ChemicalObject, ...]]:
    if not drafts:
        return err(
            RxnFlowError(
                code="invalid_input",
                message="Fixture scenario must include at least one chemical object.",
                target="objects",
            )
        )

    registered: list[ChemicalObject] = []
    provenance = Provenance(
        source_file_id="fixture-source",
        parser_id="core-fixture",
        parser_version="fixture-v0",
        parsed_at=FIXTURE_TIME,
    )
    for index, draft in enumerate(drafts):
        if not draft.energies:
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message="Fixture chemical object must include at least one energy channel.",
                    target=f"objects[{index}]",
                )
            )
        registered.append(
            ChemicalObject(
                id=f"object-{chr(ord('a') + index)}",
                label=draft.label,
                formula=draft.formula,
                charge=draft.charge,
                spin_multiplicity=draft.spin_multiplicity,
                method=draft.method,
                geometry=draft.geometry,
                energies=draft.energies,
                thermochemistry=draft.thermochemistry,
                source_file_id=provenance.source_file_id,
                provenance=provenance,
            )
        )
    return ok(tuple(registered))
