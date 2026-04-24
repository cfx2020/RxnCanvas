"""UMA service-client boundary."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class ServiceProfile:
    name: str
    mode: str
    host: str
    port: int


DEFAULT_UMA_PROFILE = ServiceProfile(
    name="win11local-uma",
    mode="machine",
    host="127.0.0.1",
    port=8765,
)


def resolve_service_profile(profile: ServiceProfile | None) -> ServiceProfile:
    return DEFAULT_UMA_PROFILE if profile is None else profile
