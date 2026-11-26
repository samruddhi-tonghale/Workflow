# Workflow Module

A single generic workflow with a TypeScript frontend, Python backend, and SQLite persistence.

## Run from this repository

```powershell
cd D:\WorkflowRepo\workflow-module
python backend\server.py
```

Then open http://127.0.0.1:8000. No Python package installation is required. The existing `workflow.db` stores the workflow. If there is no active workflow, the backend seeds one generic workflow on startup.

## TypeScript frontend

The editable source is `frontend/app.ts`; the backend serves its compiled output at `frontend/app.js`. From the repository root, install the compiler once and rebuild with:

```powershell
cd D:\WorkflowRepo
npm install
npm run build
```

Node.js/npm are only needed to rebuild the frontend, not to run the Python server when the compiled JavaScript is present.

## APIs used by the frontend

- `GET /api/health`
- `GET /api/workflows`
- `GET /api/workflows/{id}`
- `PUT /api/workflows/{id}`
- `POST /api/workflows/{id}/test` (preview only; no model is called)
- `GET /api/registry/orchestrators` and `GET /api/experts` (empty placeholders)
- `POST /api/workflows` (blocked when the single workflow exists)
- `DELETE /api/workflows/{id}` (soft-delete)

Orchestrator, Experts, and live LLM execution are not connected yet.
