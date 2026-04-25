# RxnFlow

RxnFlow is a workflow-first chemistry system for ML-assisted reaction-path screening.

## V1 Workflow

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
fmax: 0.05
steps: 200
```

For NEB, RxnFlow keeps the ASE raw outputs for inspection:

```yaml
type: neb
charge: 0
multiplicity: 1
backend: uma
optimizer: BFGS
fmax: 0.05
steps: 200
initial: initial.xyz
final: final.xyz
images: 5
```

Task output has two folders:

- `ase/` contains raw ASE files used by registration, such as `optimize.traj`,
  `scan_step_000.traj`, `neb.traj`, `neb.log`, and `image_XX.traj`.
- `inspect/` contains derived inspection exports, such as `final.xyz`,
  `peak.xyz`, `trajectory.xyz`, `band.xyz`, `images/image_XX.xyz`, and
  `energies.csv`.

RxnFlow tasks no longer write `metadata.json`; registration reads raw output.

Registration is the only path into the database:

```bash
rxnflow register-result --from-task task/opt_im1 --candidate final --new-node
rxnflow register-result --from-file gaussian.log --parser gaussian --candidate final --new-node
rxnflow register-result --from-file ase/neb.traj --parser ase --candidate peak --images 7 \
  --charge 0 --multiplicity 1 --method-label uma-s-1p1 --backend-label uma --new-node
```

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
