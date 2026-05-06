"""Core domain models for the first RxnFlow vertical slice."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


ID = str
ISODateTime = str

EnergyUnit = Literal["hartree", "kcal_mol", "kj_mol"]
ResourceKind = Literal[
    "raw_file",
    "chemical_object",
    "reaction_graph",
    "energy_profile",
    "export_artifact",
]
ReactionNodeKind = Literal["species", "transition_state", "group", "annotation"]
GraphPatchOp = Literal[
    "add_node",
    "update_node",
    "add_edge",
    "update_edge",
    "remove",
    "set_path",
]


@dataclass(frozen=True)
class EnergyValue:
    value: float
    unit: EnergyUnit
    reference: str | None = None


@dataclass(frozen=True)
class Atom3D:
    element: str
    x: float
    y: float
    z: float
    unit: Literal["angstrom"] = "angstrom"


@dataclass(frozen=True)
class Provenance:
    source_file_id: ID
    parser_id: str
    parser_version: str
    parsed_at: ISODateTime


@dataclass(frozen=True)
class Correction:
    id: ID
    kind: Literal["resonance", "solvation", "manual"]
    energy: EnergyValue
    created_at: ISODateTime
    note: str | None = None


@dataclass(frozen=True)
class ChemicalObjectDraft:
    label: str | None = None
    formula: str | None = None
    charge: int | None = None
    spin_multiplicity: int | None = None
    method: str | None = None
    geometry: tuple[Atom3D, ...] = ()
    energies: dict[str, EnergyValue] = field(default_factory=dict)
    thermochemistry: dict[str, EnergyValue] = field(default_factory=dict)


@dataclass(frozen=True)
class ChemicalObject(ChemicalObjectDraft):
    id: ID = ""
    source_file_id: ID = "fixture-source"
    corrections: tuple[Correction, ...] = ()
    provenance: Provenance | None = None
    registry_fingerprint: str | None = None


@dataclass(frozen=True)
class ProjectResource:
    id: ID
    kind: ResourceKind
    path: str | None = None
    checksum: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProjectManifest:
    id: ID
    name: str
    created_at: ISODateTime
    updated_at: ISODateTime
    schema_version: str
    resources: tuple[ProjectResource, ...] = ()


@dataclass(frozen=True)
class ReactionNode:
    id: ID
    kind: ReactionNodeKind
    label: str
    chemical_object_ids: tuple[ID, ...] = ()
    position: tuple[float, float] | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ReactionEdge:
    id: ID
    from_node: ID
    to_node: ID
    label: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ReactionPath:
    id: ID
    label: str
    node_ids: tuple[ID, ...]


@dataclass(frozen=True)
class ReactionGraph:
    id: ID
    project_id: ID
    nodes: tuple[ReactionNode, ...] = ()
    edges: tuple[ReactionEdge, ...] = ()
    paths: tuple[ReactionPath, ...] = ()


@dataclass(frozen=True)
class GraphPatch:
    op: GraphPatchOp
    node: ReactionNode | None = None
    edge: ReactionEdge | None = None
    path: ReactionPath | None = None
    id: ID | None = None
    patch: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class EnergyOptions:
    output_unit: Literal["kcal_mol", "kj_mol"]
    include_corrections: bool
    energy_key: str
    baseline_node_id: ID | None = None


@dataclass(frozen=True)
class EnergyPoint:
    node_id: ID
    label: str
    absolute_energy: EnergyValue | None = None
    relative_energy: EnergyValue | None = None
    missing_reason: str | None = None


@dataclass(frozen=True)
class EnergyProfile:
    id: ID
    graph_id: ID
    path_id: ID
    options: EnergyOptions
    points: tuple[EnergyPoint, ...]
    warnings: tuple[Any, ...] = ()


@dataclass(frozen=True)
class FixtureGraph:
    nodes: tuple[ReactionNode, ...]
    edges: tuple[ReactionEdge, ...]
    path: ReactionPath


@dataclass(frozen=True)
class FixtureScenario:
    project_name: str
    objects: tuple[ChemicalObjectDraft, ...]
    graph: FixtureGraph
    energy_options: EnergyOptions


@dataclass(frozen=True)
class CoreFixtureResult:
    project: ProjectManifest
    objects: tuple[ChemicalObject, ...]
    graph: ReactionGraph
    profile: EnergyProfile
