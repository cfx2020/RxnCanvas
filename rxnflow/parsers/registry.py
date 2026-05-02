"""Parser plugin registry and selection workflow."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from rxnflow.errors import RxnFlowError, RxnFlowWarning
from rxnflow.result import Result, err

from .contracts import ParseOptions, ParseResult, ParserCapability, ParserPlugin, RawFile

MIN_CONFIDENCE = 0.5


@dataclass(frozen=True)
class _Candidate:
    plugin: ParserPlugin
    capability: ParserCapability


class ParserRegistry:
    def __init__(self, plugins: tuple[ParserPlugin, ...]) -> None:
        self._plugins = plugins

    @classmethod
    def default(cls) -> "ParserRegistry":
        from .cclib_adapter import GaussianLogPlugin, OrcaOutputPlugin
        from .maple import MapleOutputPlugin
        from .xyz import XyzPlugin

        return cls(
            (
                MapleOutputPlugin(),
                XyzPlugin(),
                GaussianLogPlugin(),
                OrcaOutputPlugin(),
            )
        )

    @property
    def plugins(self) -> tuple[ParserPlugin, ...]:
        return self._plugins

    def parse(
        self,
        raw_file: RawFile,
        options: ParseOptions | None = None,
    ) -> Result[ParseResult]:
        input_error = _validate_raw_file_input(raw_file)
        if input_error is not None:
            return err(input_error)
        resolved_options = options or ParseOptions()
        candidates = self._candidates(raw_file, resolved_options)
        if not candidates:
            return err(
                RxnFlowError(
                    code="unsupported_format",
                    message="No parser plugin supports this RawFile.",
                    target=raw_file.target(),
                )
            )

        selected = candidates[0]
        if selected.capability.confidence < MIN_CONFIDENCE:
            return err(
                RxnFlowError(
                    code="unsupported_format",
                    message="No parser plugin supports this RawFile with sufficient confidence.",
                    target=raw_file.target(),
                    details={"confidence": selected.capability.confidence},
                )
            )

        if len(candidates) > 1 and _same_confidence(candidates[0], candidates[1]):
            warning = RxnFlowWarning(
                code="ambiguous_format",
                message="Multiple parser plugins match this RawFile with the same confidence.",
                target=raw_file.target(),
            )
            return err(
                RxnFlowError(
                    code="unsupported_format",
                    message="Parser selection is ambiguous.",
                    target=raw_file.target(),
                    details={
                        "plugins": [candidate.plugin.id for candidate in candidates],
                        "confidence": selected.capability.confidence,
                    },
                ),
                warnings=(warning,),
            )

        return selected.plugin.parse(raw_file, resolved_options)

    def _candidates(
        self,
        raw_file: RawFile,
        options: ParseOptions,
    ) -> list[_Candidate]:
        candidates: list[_Candidate] = []
        for plugin in self._plugins:
            capability = plugin.can_parse(raw_file)
            if not capability.supported:
                continue
            if options.expected_format is not None and capability.format != options.expected_format:
                continue
            candidates.append(_Candidate(plugin, capability))
        candidates.sort(key=lambda item: item.capability.confidence, reverse=True)
        return candidates


def _same_confidence(left: _Candidate, right: _Candidate) -> bool:
    return abs(left.capability.confidence - right.capability.confidence) < 1e-9


def _validate_raw_file_input(raw_file: RawFile) -> RxnFlowError | None:
    if raw_file.content is not None:
        return None
    if raw_file.path is None:
        return RxnFlowError(
            code="invalid_input",
            message="RawFile must provide either content or path.",
            target=raw_file.id,
        )
    path = Path(raw_file.path)
    if not path.is_file():
        return RxnFlowError(
            code="invalid_input",
            message="RawFile path does not exist or is not a file.",
            target=str(path),
        )
    return None
