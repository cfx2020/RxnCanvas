# RxnFlow Privacy Statement

Last updated: 2026-07-10

RxnFlow 0.1.0 is a local-first desktop application. It does not currently provide user accounts, cloud synchronization, advertising, analytics or telemetry.

## Data stored locally

RxnFlow may store the following data on the user's computer:

- project state under the selected workspace folder, normally `.rxnflow/project.json`;
- copies of imported calculation outputs under the workspace `sources/` directory;
- exported reports and their manifest under `exports/`;
- recent-project paths and application preferences in Electron's platform-specific application data directory.

Project archives are created only when the user requests an export. Opening a `.rxnflow.zip` archive extracts a new workspace next to the selected archive.

## Network behavior

The packaged application does not require a network service for normal project editing or parsing. Arbitrary network loading is disabled in the packaged macOS application, and renderer navigation/new-window creation is blocked. A Help action may open an explicitly configured documentation URL in the system browser.

## External applications

If the user chooses to open a source file in Gaussian-related or text software, RxnFlow launches the selected local application with the project-owned source path. RxnFlow does not upload that file.

## Diagnostics

RxnFlow does not automatically transmit crash reports or logs. If support requests diagnostic files, users should inspect them for confidential calculation data before sharing.

## Changes

This statement must be updated before adding telemetry, cloud sync, accounts, remote parsing or any other data transmission.
