# Vision Forge Studio Project Dashboard

React demo for the Vision Forge Studio project dashboard. It includes the login portal, draggable dashboard board, project lifecycle tabs, task details, @mention comments, animated notifications, inbox, admin users, groups, permissions, and project creation flow.

## Current Demo

- Vite + React.
- Motion-powered notification dropdown.
- Starts without preloaded project/task data.
- Uses browser `localStorage` so created projects, project statuses, tasks, users, groups, comments, attachments metadata, notifications, and dragged statuses persist on the same computer.
- No backend is required for the first visual review.

## Local Commands

For the most reliable local preview on this machine, build and open the static file:

```bash
npm.cmd run build
```

Then open `dist/index.html` in your browser.

For development with live reload:

```bash
npm install
npm run dev
```

If PowerShell blocks `npm`, use `npm.cmd install` and `npm.cmd run dev`.

## Supabase Path

For a real hosted collaboration app, yes, Supabase is the right next integration:

- Supabase Auth for login and team accounts.
- Postgres tables for projects, tasks, comments, users, groups, permissions, inbox messages, calendar updates, and notifications.
- Row-level security so users only access projects they belong to.
- Supabase Storage for attachments.
- Realtime channels for live project updates, inbox alerts, and notifications.

GitHub Pages can host this as a frontend, but the production version will need Supabase database policies before real private collaboration is safe.

## Supabase Edge Function

Users & Permissions creates Supabase Auth users through an Edge Function so the service role key never goes into the browser.

Deploy it from the project root with the Supabase CLI:

```bash
supabase functions deploy admin-create-user --project-ref ngifdiwhzqrigdlxwoua
supabase functions deploy admin-delete-user --project-ref ngifdiwhzqrigdlxwoua
```

Then set the service role secret in Supabase:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key --project-ref ngifdiwhzqrigdlxwoua
```

Use the Supabase **service_role** key from Project Settings, not the database password.
