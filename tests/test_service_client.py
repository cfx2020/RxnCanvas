from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from rxnflow.service_client import ServiceProfile, resolve_service_profile


class ServiceClientTests(unittest.TestCase):
    def test_default_profile_is_machine_level_uma(self) -> None:
        profile = resolve_service_profile(None)
        self.assertEqual(profile.name, "win11local-uma")
        self.assertEqual(profile.mode, "machine")
        self.assertEqual(profile.host, "127.0.0.1")
        self.assertGreater(profile.port, 0)

    def test_explicit_project_profile_is_supported(self) -> None:
        profile = resolve_service_profile(
            ServiceProfile(name="project-uma", mode="project", host="127.0.0.1", port=8765)
        )
        self.assertEqual(profile.name, "project-uma")
        self.assertEqual(profile.mode, "project")
        self.assertEqual(profile.port, 8765)


if __name__ == "__main__":
    unittest.main()
