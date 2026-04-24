"""UMA backend built on top of ASE + FAIRChem."""

from __future__ import annotations

from ..base import CalculatorBackend, CalculatorSettings


class UmaBackend(CalculatorBackend):
    name = "uma"

    def build(self, settings: CalculatorSettings):
        if settings.service_mode == "machine":
            return self._build_service_calculator(settings)
        return self._build_in_process_calculator(settings)

    def _build_service_calculator(self, settings: CalculatorSettings):
        return self._build_in_process_calculator(settings)

    def _build_in_process_calculator(self, settings: CalculatorSettings):
        try:
            from fairchem.core import FAIRChemCalculator, pretrained_mlip
        except ImportError as exc:
            raise RuntimeError(
                "UMA backend requires fairchem-core to be installed in the active Python environment."
            ) from exc

        predictor = pretrained_mlip.get_predict_unit(model_name=settings.model, device=settings.device)
        return FAIRChemCalculator(predictor, task_name=settings.task_name)
