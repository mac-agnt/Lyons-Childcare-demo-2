# Shournagh OS (powered by Pulse)

Frontend-only sales demonstration of an operating platform for **Shournagh Childcare**, Blarney, Co. Cork.
Built on the Pulse v4 Glass / Harbour codebase. **All data is synthetic sample data.** Nothing is sent, charged,
submitted or synced: every "sent" state is simulated.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build
```

## Deploy on Vercel

Import the GitHub repo in Vercel and press Deploy. `vercel.json` sets everything: Vite framework, `npm ci`,
`npm run build`, output `dist`. No environment variables are needed (no backend, no API keys).

The URL hash keeps your place: `#/Finance/reconciliation`, `#/Home?as=parent`, `#/Centres/today?as=manager-elm`.

## What's in it

| Area | Where |
| --- | --- |
| Synthetic dataset (single source of truth) | `src/shournagh/seed.ts` (assumptions listed at the top) |
| State, actions, derived counts, roles, tour | `src/shournagh/store.ts` |
| Helios canned, context-aware answers | `src/shournagh/chat.ts` |
| UI kit and theme tokens (`shournagh`, `shournagh-light`) | `src/shournagh/ui.tsx`, `src/shournagh/shournagh.css` |
| Pages: Overview, Centres, Families, People, Policies, Finance, Work, Activity, Settings, Records (memory, search) | `src/shournagh/pages/` |
| Room tablet and parent phone app | `src/shournagh/surfaces/` |
| Shell: site switch, Preview as, record drawer, tour, trust drawer | `src/shournagh/shell/` |
| Home (Helios chat), Agents, Ontology graph, Files, Contacts | `src/views/` + `src/logic/` (Pulse, re-skinned) |

## Demo controls

- **Site switch** (sidebar): Both / Elmgrove / Ballyneety. Site managers are locked to their own centre.
- **Preview as** (top right): Owner (Edel Lyons), Site Manager Elmgrove / Ballyneety, Room Educator (tablet),
  HR Admin, Parent (phone app). Same data, scoped views.
- **Tour for Edel**: six stops (overview, two sites, policy, room tablet, parent phone, finance).
- **Away mode** (Home rail): managers run the day; only the one owner decision escalates.
- **Reset demo** (Preview as menu): back to the start of the demo day.

## Story figures (baseline, all derived from the dataset)

30 staff (17 Elmgrove, 13 Ballyneety), 23 on duty, 7 away. 104 children expected today (62 + 42), 121 holding
bookings (70 + 51). Registered capacity is reference only: Elmgrove 77, Ballyneety 55 sessional; the Ballyneety
school-age service (TU2021CC067SA) is separate and never added. 6 overdue invoices = €2,940. 3 NCS/ECCE mismatches
= €432. Safe Sleep v4.0: 26 of 30 signed. 1 cover request, 1 urgent parent notice (acknowledged), 1 new enquiry.

## Assumptions to validate with the client

Room names and sizes, which rooms run in which building, every person other than Edel Lyons (Claire Lyons appears only
as the public register contact), fees and funding amounts, legal relationship between the two registrations, Acorn
export/API feasibility, NCS/ECCE portal routes, email/SMS providers, and any statutory ratio rules (none configured:
staffing shows as a coverage watch).

## Template rules kept

See `CLAUDE.md`: Agents sits directly under Home, Records opens on Ontology first, the Home centre column stays clean
(briefing cards live in the right rail). Don't run `npm run import-design` on this copy.
