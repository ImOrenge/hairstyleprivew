# Web To Native Port Map

Native app target: `apps/hairfit-app`

Status values:

- `inventory`: web route identified, native work not started.
- `scaffolded`: native route placeholder exists.
- `ported`: native UI and API behavior implemented.
- `verified`: native states tested against the web source route.

## Unified HairFit App

| Web route | Native target | Service | Status | Notes |
| --- | --- | --- | --- | --- |
| `/` | `apps/hairfit-app/app/index.tsx` | shared | ported | Role-aware home that branches by `MobileBootstrap.services`; customer home shows confirmed treatment styles as image cards while generation monitoring stays in My Page work status. An offline → online recovery token refreshes the read model without replaying commands. |
| `/login/[[...rest]]` | `apps/hairfit-app/app/(auth)/login.tsx` | customer | ported | Clerk Expo email/password sign-in with session activation; email/SMS/TOTP/backup-code second factors stay in-app, while required and provider field errors are safely mapped, announced, and focused. |
| Clerk password reset | `apps/hairfit-app/app/(auth)/forgot-password.tsx` | customer | ported | Email reset code, new-password confirmation, sign-out-other-sessions, post-reset MFA, and the validated pending ResumeTarget are kept in one native recovery flow. |
| `/signup/[[...rest]]` | `apps/hairfit-app/app/(auth)/signup.tsx` | customer | ported | Clerk Expo sign-up and email-code verification with safely mapped field errors and first-invalid focus; a completed session returns to the app entry route. Account setup is canonicalized at `/mypage?tab=account&setup=1` rather than a separate `/onboarding` route. |
| `/upload` | `apps/hairfit-app/app/upload.tsx` | customer | ported | `/api/mobile/me` must confirm a complete member profile before the image picker is exposed; incomplete members resume through the canonical account tab and salon owners return to their role home. The picker enforces the shared 8MB and 512px upload contract before sending, labels ImagePicker base64 as JPEG, securely prepares the draft receipt, blocks back while upload is in flight, and separates requestable denial from settings-only recovery. |
| `/personal-color` | `apps/hairfit-app/app/personal-color.tsx` | customer | ported | Personal-color diagnosis progress respects reduced-motion settings, exposes real status text, labels animated palette comparisons as non-measurement previews, and provides settings recovery for permanently denied photo access. |
| `/generate` | `apps/hairfit-app/app/generate.tsx` | customer | ported | Accepts the durable background job with a paid-action quote, blocks back until the acceptance receipt arrives, then replaces stale upload history after acceptance. |
| `/generate/[id]` | `apps/hairfit-app/app/generate/[id].tsx` | customer | ported | Shows and polls the nine-item recommendation board, blocks back while a result is opening or retrying, pauses polling while offline, refreshes after reconnect, and safely returns to My Page without stacking stale work screens. |
| `/workspace` | `apps/hairfit-app/app/upload.tsx` | customer | ported | Web workspace wizard is split into the native upload, generate, and result flow. |
| `/result/[id]` | `apps/hairfit-app/app/result/[id].tsx` | customer | ported | Loads generation result, refreshes the read model after reconnect, and saves selected variant only through an explicit user command. |
| `/styler/new` | `apps/hairfit-app/app/styler/new.tsx` | customer | ported | Fashion recommendation wizard with guarded back navigation during profile/photo/recommendation/generation commands; its read models refresh after reconnect without replaying recommendation or paid generation, its hair picker modal consumes Android back as modal close, and body-photo denial can recover through the shared OS settings CTA. |
| `/styler/[id]` | `apps/hairfit-app/app/styler/[id].tsx` | customer | ported | Fashion lookbook result detail. |
| `/mypage` | `apps/hairfit-app/app/mypage.tsx` | customer | ported | Mobile dashboard separates status-aware generation work monitoring from confirmed treatment style cards. The account tab saves required member fields and consumes only enum-based `generation-upload`/`generation-submit` continuation values before returning to the native flow. |
| `/account` | `apps/hairfit-app/app/account.tsx` | shared | ported | Role-aware account summary with logout-before-resume-cleanup ordering and device push revoke safety. Generic logout clears stale auth ResumeTarget state but account-scoped unsettled payment recovery remains available. |
| `/billing` | `apps/hairfit-app/app/billing.tsx` | customer | ported | Loads the account snapshot, prepares and verifies PortOne payment, blocks back during server verification, and preserves the pending order when the embedded payment window closes. |
| `/payments/complete` | `apps/hairfit-app/app/payments/complete.tsx` | customer | ported | Deep-link payment completion blocks back until server verification resolves, then uses replacement navigation to avoid replaying the callback. |
| `/aftercare` | `apps/hairfit-app/app/aftercare.tsx` | customer | ported | Confirmed treatment list with selected hairstyle image cards through the mobile aftercare API. |
| `/aftercare/[hairRecordId]` | `apps/hairfit-app/app/aftercare/[hairRecordId].tsx` | customer | ported | Hair care detail through mobile aftercare API. |
| `/privacy-policy` | `apps/hairfit-app/app/legal/privacy.tsx` | customer | ported | Native legal page from web legal structure. |
| `/terms-of-service` | `apps/hairfit-app/app/legal/terms.tsx` | customer | ported | Native legal page from web legal structure. |
| `/salon` | `apps/hairfit-app/app/salon/index.tsx` | salon | ported | Salon role home in the unified app. |
| `/salon/customers` | `apps/hairfit-app/app/salon/customers/index.tsx` | salon | ported | Reads customer summary through `/api/mobile/dashboard?service=salon`. |
| `/salon/customers/[id]` | `apps/hairfit-app/app/salon/customers/[id].tsx` | salon | ported | Customer detail, visits, linked member generations, and aftercare tasks. |
| `/salon/match/[code]` | `apps/hairfit-app/app/salon/match/[code].tsx` | salon | ported | Customer match invite lookup and acceptance. |
| `/admin` | `apps/hairfit-app/app/admin/index.tsx` | admin | ported | Reads admin overview through `/api/mobile/dashboard?service=admin`. |
| `/admin/stats` | `apps/hairfit-app/app/admin/stats.tsx` | admin | ported | Shows 30-day KPI and daily trend from mobile dashboard API. |
| `/admin/members` | `apps/hairfit-app/app/admin/members.tsx` | admin | ported | Member list with account type, onboarding, credits, search, and filters. |
| `/admin/members/[userId]` | `apps/hairfit-app/app/admin/members/[userId].tsx` | admin | ported | Member detail, profile snapshots, activity, payments, and salon activity. |
| `/admin/reviews` | `apps/hairfit-app/app/admin/reviews.tsx` | admin | ported | Review list and visibility filter. |
| `/admin/inbox` | `apps/hairfit-app/app/admin/inbox.tsx` | admin | ported | Inbound support email list and status summary. |
| `/admin/b2b` | `apps/hairfit-app/app/admin/b2b.tsx` | admin | ported | B2B lead pipeline list and stage summary. |

## API Facade Work

| API area | Mobile owner | Status | Notes |
| --- | --- | --- | --- |
| `/api/mobile/me` | shared | ported | Uses shared mobile auth context, works before setup is complete, and is the authoritative native pre-upload profile gate. |
| `/api/mobile/dashboard` | shared | ported | Role-aware customer, salon, and admin summary facade; the customer response includes the versioned shared credit-policy snapshot and recent confirmed treatment styles with selected variant media. |
| `/api/mobile/payments/prepare` | customer | ported | Creates pending PortOne mobile payment transactions. |
| `/api/mobile/payments/complete` | customer | ported | Verifies PortOne payment and grants credits idempotently. |
| `/api/mobile/aftercare` | customer | ported | Lists confirmed hair records with selected variant image media for mobile aftercare cards. |
| `/api/mobile/aftercare/[hairRecordId]` | customer | ported | Returns a confirmed hair record and guide JSON for mobile aftercare detail. |
| Existing authenticated API client | shared | ported | On an authenticated 401, the client forces one Clerk token refresh with `skipCache` and retries the same request exactly once; unauthenticated requests and network-ambiguous failures are not replayed. |
| Existing `/api/generations/*` | customer | ported | The native flow starts the durable workflow, reads status/detail endpoints, and uses `/run` only for local fallback or explicit variant retry. Completion notification is server-owned rather than dependent on the app remaining open; reconnect only refreshes reads. |
| Existing `/api/styling/*` | customer | ported | Fashion recommendation and lookbook generation; reconnect refreshes profile/session reads but never replays recommendation or paid execution commands. |
| Existing `/api/salon/*` | salon | ported | Salon CRM customer detail and matching invite screens call the existing salon APIs. |
| Existing `/api/admin/*` | admin | ported | Admin list/detail screens call the existing admin APIs through the shared client. |

## Verification Boundary

- `npm run mobile:sync` checks files, route mappings, package boundaries, and source-contract markers only. It does not launch the web server, Metro, a simulator, or a physical device.
- `npm run mobile:sync:runtime` adds unauthenticated API and Metro availability smoke checks. It is still not an authenticated or device E2E test.
- A route remains `ported` until its user flow is exercised against a running backend and native runtime with evidence. No row is promoted to `verified` by static checks alone.
