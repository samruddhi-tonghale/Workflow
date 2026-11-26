# Workflow Module

A single generic workflow with a TypeScript frontend, Python backend, and SQLite persistence.

## Run

```powershell
cd D:\WorkflowRepo\workflow-module
python backend\server.py
```

Open http://127.0.0.1:8000. The database stores the workflow and is created with one generic workflow if missing.

## Rebuild the TypeScript frontend

From the repository root:

```powershell
cd D:\WorkflowRepo
npm install
npm run build
```

See [workflow-module/README.md](workflow-module/README.md) for setup, database behavior, and API routes.
