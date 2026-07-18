# Collaboration and Sync

SCS collaboration is local-first. A team shares the same portable `scs.project.json` through a provider-synced folder, network folder, removable drive, or an HTTPS Git remote. SCS does not require an account and does not upload a project by itself.

## Roles

Roles gate every mutating SCS control and are also checked by the collaboration domain before data changes are accepted.

| Role | Edit script/data | Comment | Suggest | Approve | Manage reviews | Writer room | Resolve/sync | Manage people |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Owner | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Writer | Yes | Yes | Yes | — | Yes | Yes | Yes | — |
| Co-writer | Yes | Yes | Yes | — | Yes | Yes | Yes | — |
| Director | — | Yes | Yes | Yes | Yes | — | — | — |
| Producer | — | Yes | Yes | Yes | Yes | Yes | — | — |
| Story editor | Yes | Yes | Yes | Yes | Yes | Yes | — | — |
| Script coordinator | Yes | Yes | Yes | — | Yes | Yes | Yes | — |
| Reader | — | Yes | Yes | — | — | — | — | — |
| Viewer | — | — | — | — | — | — | — | — |

The **Acting as** selector is a local advisory identity, not authentication. It lets a trusted team test and use role-specific workflows without a server. Anyone who can directly edit the JSON or run a modified build can bypass it. Use operating-system permissions, the cloud provider's sharing controls, or Git-host access controls for a real security boundary.

Machine-local identity, watch-folder paths, per-document linked-FDX paths/timestamps, shared-folder mount paths, Git author details, and last-sync status are excluded from portable project data, history, and collaborator merges. Selecting an identity or relinking an FDX on one computer cannot change another collaborator's local setup.

## Reviews, approvals, and the writer room

- Comments can target the project, script, scene, screenplay block, or treatment.
- Suggestions target a block or treatment inside one specific document. Accepting a suggestion is atomic and stops if the target changed after the suggestion was written.
- Draft approvals always reference an existing **Save Draft Version** snapshot and a role allowed to approve. A reviewer with a pending decision cannot be removed or demoted until that decision is resolved.
- Writer room mode stores an agenda, synchronized active scene, assignments, and completion state. An assignee can complete their own task; room managers can update the whole room.
- Legacy per-document comments are surfaced in the project review workflow when an older project opens.

## Provider-synced or network folders

1. Open **Team** and choose **Create Shared Copy**.
2. Save `scs.project.json` inside the Dropbox, OneDrive, iCloud Drive, Syncthing, NAS, or other shared folder already managed by the team.
3. Teammates open that exact manifest with **Open Project**. SCS always synchronizes the path they opened on their own machine; a creator's absolute path is never reused.
4. Use **Sync Now** at deliberate handoff points.

The authoritative JSON manifest uses a synchronized temporary file plus a protected backup, and SCS compares its exact contents again immediately before replacement. If another visible shared-folder update arrived first, SCS rejects the stale write instead of overwriting it. Fountain mirrors refresh separately after the JSON commit, so no multi-file or distributed-provider atomicity is claimed; provider propagation can still delay when another computer's update becomes visible. With a trustworthy common baseline, screenplay blocks and structured ID-keyed records are merged three ways. Independent comments, tasks, approvals, layouts, treatments, continuity records, and history entries survive automatically. Every true overlap shows its path, current value, shared value, and an individual choice. SCS creates **Before shared collaboration merge** and **Shared collaboration merge** history entries before saving the result.

After recovery storage is reopened, SCS reloads the portable file as the merge baseline only when its timestamp still matches. If the shared file already changed and no trustworthy baseline exists, automatic combination is disabled; the user must choose the complete local or shared project. This is intentionally conservative.

## HTTPS Git sync

Git sync operates on the portable project folder as a whole:

1. Save a portable project so the folder contains `scs.project.json`.
2. In **Team**, enter a valid branch, optional credential-free HTTPS origin, and local author identity.
3. Choose **Initialize**, then **Save Sync Point**.
4. Use **Pull** before new work and **Push** after a clean sync point.

SCS uses the system Git executable, fixed argument lists, HTTPS-only remotes, fast-forward-only pulls, and non-force pushes. It overrides repository hooks, signing, and editors; rejects repository-local filters, credential helpers, askpass, SSH-command, diff-command, and merge-driver configuration; and removes inherited repository-routing variables for its commands. Pull and push require a clean, conflict-free repository and time out rather than hanging indefinitely. Credentials may still come from the user's normal system or global Git credential manager, but repository-local helpers and credentials embedded in a remote URL are rejected.

SCS deliberately does not guess through divergent Git history. If both clones commit before pulling, pull and push stop safely. Resolve or rebase the branch with a trusted Git client, then return to SCS and refresh status. Teams that want an in-app structured conflict workflow should use the shared-folder flow above for handoffs and use Git as the durable remote history.

## Recovery rules

- Never delete the portable file when resolving a conflict. Make a filesystem copy first if the project is especially valuable.
- Keep SCS-generated recovery/merge versions until the combined project has been reopened and checked.
- If a role or malformed shared record is invalid, normalization repairs safe references and drops malformed review, approval, or task records before the Team panel renders.
- Fountain source mode is materialized into the project for local recovery, versions, portable saves, and Git/shared sync. Pull is blocked while source text has not been saved into a sync point.
