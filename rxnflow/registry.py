"""Chemical object registration services."""

from __future__ import annotations

from dataclasses import asdict, replace
import hashlib
import json
from typing import TYPE_CHECKING

from .errors import RxnFlowError
from .models import ChemicalObject, ChemicalObjectDraft, Correction, ID, Provenance
from .project import FIXTURE_TIME
from .result import Result, err, ok

if TYPE_CHECKING:
    from .parsers.contracts import ParseResult


class ChemicalRegistry:
    """Project-scoped in-memory registry for parsed chemical objects."""

    def __init__(self) -> None:
        self._projects: dict[ID, _RegistryState] = {}

    def register(
        self,
        project_id: ID,
        parse_result: ParseResult,
    ) -> Result[tuple[ChemicalObject, ...]]:
        if not project_id:
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message="Project id is required to register chemical objects.",
                    target="project_id",
                )
            )
        if not parse_result.objects:
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message="Parse result must contain at least one chemical object draft.",
                    target="parse_result.objects",
                )
            )

        state = self._projects.setdefault(project_id, _RegistryState())
        registered: list[ChemicalObject] = []
        for draft_index, draft in enumerate(parse_result.objects):
            fingerprint = _registry_fingerprint(parse_result.provenance, draft_index, draft)
            existing_id = state.fingerprint_to_object_id.get(fingerprint)
            if existing_id is not None:
                registered.append(state.objects[existing_id])
                continue

            object_id = _object_id(project_id, fingerprint)
            chemical_object = ChemicalObject(
                id=object_id,
                label=draft.label,
                formula=draft.formula,
                charge=draft.charge,
                spin_multiplicity=draft.spin_multiplicity,
                method=draft.method,
                geometry=draft.geometry,
                energies=draft.energies,
                thermochemistry=draft.thermochemistry,
                source_file_id=parse_result.provenance.source_file_id,
                corrections=(),
                provenance=parse_result.provenance,
            )
            state.objects[object_id] = chemical_object
            state.fingerprint_to_object_id[fingerprint] = object_id
            registered.append(chemical_object)
        return ok(tuple(registered))

    def get_object(self, project_id: ID, object_id: ID) -> Result[ChemicalObject]:
        state = self._projects.get(project_id)
        if state is None or object_id not in state.objects:
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message="Chemical object is not registered in this project.",
                    target=object_id,
                )
            )
        return ok(state.objects[object_id])

    def apply_correction(
        self,
        project_id: ID,
        object_id: ID,
        correction: Correction,
    ) -> Result[ChemicalObject]:
        if not correction.id:
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message="Correction id is required.",
                    target="correction.id",
                )
            )

        state = self._projects.get(project_id)
        if state is None or object_id not in state.objects:
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message="Chemical object is not registered in this project.",
                    target=object_id,
                )
            )

        chemical_object = state.objects[object_id]
        for existing in chemical_object.corrections:
            if existing.id != correction.id:
                continue
            if existing == correction:
                return ok(chemical_object)
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message="Correction id already exists with different content.",
                    target=correction.id,
                )
            )

        updated = replace(
            chemical_object,
            corrections=chemical_object.corrections + (correction,),
        )
        state.objects[object_id] = updated
        return ok(updated)


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


class _RegistryState:
    def __init__(self) -> None:
        self.objects: dict[ID, ChemicalObject] = {}
        self.fingerprint_to_object_id: dict[str, ID] = {}


def _registry_fingerprint(
    provenance: Provenance,
    draft_index: int,
    draft: ChemicalObjectDraft,
) -> str:
    payload = {
        "source_file_id": provenance.source_file_id,
        "parser_id": provenance.parser_id,
        "parser_version": provenance.parser_version,
        "draft_index": draft_index,
        "draft": asdict(draft),
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _object_id(project_id: ID, fingerprint: str) -> ID:
    payload = f"{project_id}:{fingerprint}".encode("utf-8")
    return f"object-{hashlib.sha256(payload).hexdigest()[:16]}"
