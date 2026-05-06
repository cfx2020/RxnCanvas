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
                registry_fingerprint=fingerprint,
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

    def list_objects(self, project_id: ID) -> Result[tuple[ChemicalObject, ...]]:
        if not project_id:
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message="Project id is required to list chemical objects.",
                    target="project_id",
                )
            )
        state = self._projects.get(project_id)
        if state is None:
            return ok(())
        return ok(tuple(state.objects.values()))

    def restore_objects(
        self,
        project_id: ID,
        objects: tuple[ChemicalObject, ...],
        *,
        replace: bool = False,
    ) -> Result[tuple[ChemicalObject, ...]]:
        if not project_id:
            return err(
                RxnFlowError(
                    code="invalid_input",
                    message="Project id is required to restore chemical objects.",
                    target="project_id",
                )
            )

        validation = _validate_restore_objects(objects)
        if validation is not None:
            return err(validation)

        state = _RegistryState() if replace else self._projects.setdefault(project_id, _RegistryState())
        restored_objects = dict(state.objects)
        restored_fingerprints = dict(state.fingerprint_to_object_id)

        for obj in objects:
            existing = restored_objects.get(obj.id)
            if existing is not None:
                if existing != obj:
                    return err(
                        RxnFlowError(
                            code="invalid_input",
                            message="Chemical object id already exists with different content.",
                            target=obj.id,
                        )
                    )
                continue

            if obj.registry_fingerprint:
                existing_id = restored_fingerprints.get(obj.registry_fingerprint)
                if existing_id is not None and existing_id != obj.id:
                    return err(
                        RxnFlowError(
                            code="invalid_input",
                            message="Registry fingerprint already points to a different chemical object.",
                            target="registry_fingerprint",
                            details={
                                "registry_fingerprint": obj.registry_fingerprint,
                                "existing_object_id": existing_id,
                                "object_id": obj.id,
                            },
                        )
                    )
                restored_fingerprints[obj.registry_fingerprint] = obj.id

            restored_objects[obj.id] = obj

        state.objects = restored_objects
        state.fingerprint_to_object_id = restored_fingerprints
        self._projects[project_id] = state
        return ok(tuple(objects))

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


def _validate_restore_objects(objects: tuple[ChemicalObject, ...]) -> RxnFlowError | None:
    object_ids: set[ID] = set()
    fingerprint_to_object_id: dict[str, ID] = {}
    for index, obj in enumerate(objects):
        if not obj.id:
            return RxnFlowError(
                code="invalid_input",
                message="Restored chemical object id is required.",
                target=f"objects[{index}].id",
            )
        if not obj.source_file_id:
            return RxnFlowError(
                code="invalid_input",
                message="Restored chemical object source_file_id is required.",
                target=f"objects[{index}].source_file_id",
            )
        if obj.id in object_ids:
            return RxnFlowError(
                code="invalid_input",
                message="Chemical object id is duplicated in restore payload.",
                target=obj.id,
            )
        object_ids.add(obj.id)
        if not obj.registry_fingerprint:
            continue
        existing_id = fingerprint_to_object_id.get(obj.registry_fingerprint)
        if existing_id is not None and existing_id != obj.id:
            return RxnFlowError(
                code="invalid_input",
                message="Registry fingerprint is duplicated for different chemical objects.",
                target="registry_fingerprint",
                details={
                    "registry_fingerprint": obj.registry_fingerprint,
                    "existing_object_id": existing_id,
                    "object_id": obj.id,
                },
            )
        fingerprint_to_object_id[obj.registry_fingerprint] = obj.id
    return None


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
