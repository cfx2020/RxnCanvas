# RxnFlow

RxnFlow is a task-first chemistry runner for ML-assisted reaction-path screening.

## V1 Task Runner

Task execution is raw-only:

```bash
rxnflow validate-task task/opt_im1
rxnflow run-task task/opt_im1
```

Use ASE names in `task.yaml` where possible. `type: optimize` is ASE structure
optimization:

```yaml
type: optimize
charge: 0
multiplicity: 1
backend: uma
optimizer: LBFGS
fmax: 0.0025
steps: 2000
```

For NEB, RxnFlow keeps the ASE raw outputs for inspection:

```yaml
type: neb
charge: 0
multiplicity: 1
backend: uma
optimizer: LBFGS
fmax: 0.025
steps: 2000
initial: initial.xyz
final: final.xyz
intermediate_images: 5
climb: false
```

`intermediate_images` counts only the inserted NEB images; endpoints are included
in `neb_final_path.xyz` and `neb_final_path.extxyz`.
NEB endpoint preoptimization uses the optimize defaults (`LBFGS`,
`fmax: 0.0025`, `steps: 2000`); NEB task `fmax` and `steps` apply to the band
optimization.

If `fmax` and `steps` are omitted, task-type defaults are:

- `optimize`: `fmax: 0.0025`, `steps: 2000`
- `scan`: `fmax: 0.0025`, `steps: 2000`
- `neb`: `fmax: 0.025`, `steps: 2000`

Task output is mostly flat. The only task-local subdirectory is `image/`, used
for per-image NEB files:

- Optimize writes `opt.traj`, `opt.log`, `opt_traj.xyz`, `opt_traj.extxyz`,
  `opt_energies.csv`, and `final.xyz`.
- Scan writes `scan_step_XXX.traj`, `scan_step_XXX.log`, `scan_traj.xyz`,
  `scan_traj.extxyz`, `scan_energies.csv`, `scan_energy_profile.png`,
  `peak.xyz`, and `final.xyz`.
- NEB first optimizes the endpoints and writes `initial_opt.traj`,
  `initial_opt.log`, `initial_opt.xyz`, `initial_opt_traj.xyz`,
  `initial_opt_traj.extxyz`, `initial_opt_energies.csv`, plus the matching
  `final_opt.*` files. It then writes `neb.traj`, `neb.log`, `neb_traj.xyz`,
  `neb_traj.extxyz`, `neb_final_path.xyz`, `neb_final_path.extxyz`,
  `neb_energy_profile.png`, `neb_energies.csv`, `peak.xyz`, and
  `image/image_XX.xyz`.

RxnFlow tasks no longer write `metadata.json`; registration reads raw output.
RxnFlow-generated ASE `extxyz` outputs include charge, multiplicity, backend,
model, and task name metadata so registration usually does not need those
values repeated on the command line.

Registration is the only path into the database:

```bash
rxnflow register gaussian.log
rxnflow register task/neb_path/initial_opt_traj.extxyz
rxnflow register task/neb_path/final_opt_traj.extxyz
rxnflow register task/neb_path/neb_final_path.extxyz --peak
```

The longer `register-result --from-file ...` form is still accepted. The parser
is inferred from file extension by default (`extxyz`/`traj`/`xyz` as ASE,
`log` as Gaussian, `out` as ORCA), `--new-node` is the default when
`--attach-node` is not given, and task-path inputs write to the project-level
`database/project.sqlite`, not a task-local database. Use `--project-root` only
when registering a file outside the project layout.

Reports read registered calculations only:

```bash
rxnflow create-report report/main
rxnflow rebind-report report/main --site IM1 --calculation calc_id
rxnflow validate-report report/main
rxnflow render-report report/main
```

Project layout:

```text
task/
report/
database/
  project.sqlite
  objects/
```

The default UMA execution boundary is a machine-level shared service on `win11local`.
