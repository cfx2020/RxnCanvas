"""Core fixture workflow entry point."""

from __future__ import annotations

from .models import (
    ChemicalObjectDraft,
    CoreFixtureResult,
    EnergyOptions,
    EnergyValue,
    FixtureGraph,
    FixtureScenario,
    ProjectResource,
    ReactionEdge,
    ReactionNode,
    ReactionPath,
)
from .energy import compute_fixture_profile
from .graph import build_fixture_graph
from .project import attach_resources, create_project
from .registry import register_fixture_objects
from .result import Result, ok


def default_core_fixture_scenario() -> FixtureScenario:
    return FixtureScenario(
        project_name="fixture-minimal-reaction",
        objects=(
            ChemicalObjectDraft(
                label="Fixture A",
                energies={"electronic": EnergyValue(-100.000000, "hartree")},
            ),
            ChemicalObjectDraft(
                label="Fixture B",
                energies={"electronic": EnergyValue(-99.980000, "hartree")},
            ),
        ),
        graph=FixtureGraph(
            nodes=(
                ReactionNode(
                    id="node-a",
                    kind="species",
                    label="A",
                    chemical_object_ids=("object-a",),
                ),
                ReactionNode(
                    id="node-b",
                    kind="species",
                    label="B",
                    chemical_object_ids=("object-b",),
                ),
            ),
            edges=(ReactionEdge(id="edge-a-b", from_node="node-a", to_node="node-b"),),
            path=ReactionPath(id="path-a-b", label="A to B", node_ids=("node-a", "node-b")),
        ),
        energy_options=EnergyOptions(
            baseline_node_id="node-a",
            output_unit="kcal_mol",
            include_corrections=False,
            energy_key="electronic",
        ),
    )


def run_core_fixture_vertical_slice(
    scenario: FixtureScenario | None = None,
) -> Result[CoreFixtureResult]:
    """Run the deterministic core fixture vertical slice."""
    scenario = scenario or default_core_fixture_scenario()

    project = create_project(scenario.project_name)
    objects_result = register_fixture_objects(scenario.objects)
    if not objects_result.ok or objects_result.value is None:
        return objects_result
    objects = objects_result.value

    graph_result = build_fixture_graph(project.id, scenario.graph, objects)
    if not graph_result.ok or graph_result.value is None:
        return graph_result
    graph = graph_result.value

    profile_result = compute_fixture_profile(graph, objects, scenario.energy_options)
    if not profile_result.ok or profile_result.value is None:
        return profile_result
    profile = profile_result.value

    project = attach_resources(
        project,
        (
            *(ProjectResource(id=obj.id, kind="chemical_object") for obj in objects),
            ProjectResource(id=graph.id, kind="reaction_graph"),
            ProjectResource(id=profile.id, kind="energy_profile"),
        ),
    )
    return ok(CoreFixtureResult(project=project, objects=objects, graph=graph, profile=profile))
