# Workflow Studio

Standalone workflow module starter based on **Workflow Module – User Stories & Data Flow**. Includes a dark workflow management UI, flow canvas, draft persistence, configuration panels, thresholds, validation, and a local SQLite API.

## Run locally

Requires Python 3.10+ and no third-party packages.

```powershell
cd D:\Monday\WorkflowModule
python server.py
```

Open http://127.0.0.1:8000. Drafts persist in `workflow.db`, created beside the server.

## Included

- Workflow list, name search, status filter, create, duplicate, activate/deactivate and soft delete.
- New drafts start with Request → Orchestrator → Registry → Expert → Escalation → Aggregator → Response.
- Canvas node selection, moving, palette drag/drop, adding nodes, zoom, basic structural validation and editable settings.
- Auto-save for graph and settings to SQLite.
- Preview endpoint that returns a trace but never calls a model.
- Empty Orchestrator and Experts integration placeholders.

## Integration boundaries

`GET /api/registry/orchestrators`, `GET /api/experts`, and `POST /api/workflows/{id}/test` (preview only) are scaffolds. No orchestration engine, expert catalogue, model provider, secrets vault, live endpoint or audit service is bundled. Connect API keys to a secrets vault when escalation is integrated.

## Layout

```text
WorkflowModule/
  server.py
  workflow.db        Created on first run
  web/index.html
  web/styles.css
  web/app.js
```

## Manual testing

1. Open PowerShell and run:
   ```powershell
   cd D:\WorkflowModule
   python server.py
   ```
2. Visit http://127.0.0.1:8000. The first load should show the empty workflow list.
3. Click **Create your first workflow**, enter a unique name (3–60 characters), and create it. The canvas should show the default seven-node path.
4. Click **Orchestrator** and **Experts** in the left navigation. Each opens an integration-pending page; use **Go to Workflows** to return.
5. Select a node, change its name or setting, then wait for **All changes saved**. Refresh the browser and reopen the workflow to check persistence.
6. Drag a node from the palette onto the canvas, move a node, and use **Validate flow**.
7. Click **Test**, enter a sample request, and confirm the response says preview only and that no model was called.
8. Return to the list and try search, status filtering, duplicate, deactivate, and delete on a draft.

The Test action is currently a structural preview; it does not run an orchestrator or expert. Publishing is intentionally blocked until integrations and dataset testing exist.

Optional API check from a second PowerShell window while the server runs:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
Invoke-RestMethod http://127.0.0.1:8000/api/workflows
```

## Builder view

The workflow builder is diagram-focused: the node palette and settings panel are hidden. The canvas scales to fit the available width and includes zoom and fit controls. Workflow name, save, test preview, publish status and structural validation remain available around the diagram.
