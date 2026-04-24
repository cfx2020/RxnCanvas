# RxnFlow

RxnFlow is a workflow-first chemistry system for ML-assisted reaction-path screening.

## V1 Workflow

Task execution is raw-only:

```bash
rxnflow validate-task task/opt_im1
rxnflow run-task task/opt_im1
```

Registration is the only path into the database:

```bash
rxnflow register-result --from-task task/opt_im1 --candidate final --new-node
rxnflow register-result --from-file gaussian.log --parser gaussian --candidate final --new-node
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
