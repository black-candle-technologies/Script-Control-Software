# FDX import

SCS Phase 1 opens local `.fdx` files through the desktop file picker. Parsing happens in Rust and the normalized document is shown in the existing screenplay workspace.

Imported FDX documents are intentionally read-only. The original file is never changed, copied, or moved. The toolbar identifies this state as **FDX Read-Only — Editing arrives in Phase 3**.

Choose **Open FDX** on the home screen or toolbar. To place the linked file in a portable SCS wrapper, choose **Create SCS Project** and save the generated `scs.project.json`. If the linked FDX is renamed, moved, deleted, or no longer readable, SCS cannot reopen it until the manifest is repaired or a new wrapper is created.

Import errors are writer-facing messages for cancellation, incorrect extensions, missing or unreadable files, malformed XML, and empty scripts. Recoverable parser conditions appear in the import summary without blocking the viewer.

FDX export and round-trip editing are not available. Keep backups of original scripts.
