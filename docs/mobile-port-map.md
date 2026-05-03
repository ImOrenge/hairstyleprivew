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
| `/` | `apps/hairfit-app/app/index.tsx` | shared | ported | Role-aware home that branches by `MobileBootstrap.services`. |
| `/login/[[...rest]]` | `apps/hairfit-app/app/(auth)/login.tsx` | customer | ported | Clerk Expo email/password sign-in with session activation. |
| `/signup/[[...rest]]` | `apps/hairfit-app/app/(auth)/signup.tsx` | customer | ported | Clerk Expo sign-up, email-code verification, onboarding handoff. |
| `/onboarding` | `apps/hairfit-app/app/onboarding.tsx` | customer | ported | Member onboarding posts to existing `/api/onboarding`. |
| `/upload` | `apps/hairfit-app/app/upload.tsx` | customer | ported | Native image picker creates the data URL used by recommendation APIs. |
| `/generate` | `apps/hairfit-app/app/generate.tsx` | customer | ported | Calls `/api/prompts/generate` and `/api/generations/run`. |
| `/generate/[id]` | `apps/hairfit-app/app/generate/[id].tsx` | customer | ported | 3x3 recommendation board, analysis summary, render retry, and result handoff. |
| `/workspace` | `apps/hairfit-app/app/upload.tsx` | customer | ported | Web workspace wizard is split into the native upload, generate, and result flow. |
| `/result/[id]` | `apps/hairfit-app/app/result/[id].tsx` | customer | ported | Loads generation result and saves selected variant. |
| `/styler/new` | `apps/hairfit-app/app/styler/new.tsx` | customer | ported | Fashion recommendation wizard. |
| `/styler/[id]` | `apps/hairfit-app/app/styler/[id].tsx` | customer | ported | Fashion lookbook result detail. |
| `/mypage` | `apps/hairfit-app/app/mypage.tsx` | customer | ported | Mobile dashboard, generation history, and PortOne billing entry. |
| `/payments/complete` | `apps/hairfit-app/app/payments/complete.tsx` | customer | ported | Deep-link payment completion and server verification. |
| `/aftercare` | `apps/hairfit-app/app/aftercare.tsx` | customer | ported | Hair care list through mobile aftercare API. |
| `/aftercare/[hairRecordId]` | `apps/hairfit-app/app/aftercare/[hairRecordId].tsx` | customer | ported | Hair care detail through mobile aftercare API. |
| `/privacy-policy` | `apps/hairfit-app/app/legal/privacy.tsx` | customer | ported | Native legal page from web legal structure. |
| `/terms-of-service` | `apps/hairfit-app/app/legal/terms.tsx` | customer | ported | Native legal page from web legal structure. |
| `/salon` | `apps/hairfit-app/app/salon/index.tsx` | salon | ported | Salon role home in the unified app. |
| `/salon/customers` | `apps/hairfit-app/app/salon/customers/index.tsx` | salon | ported | Reads customer summary through `/api/mobile/dashboard?service=salon`. |
| `/salon/customers/[id]` | `apps/hairfit-app/app/salon/customers/[id].tsx` | salon | inventory | Customer detail, visits, aftercare tasks. |
| `/salon/match/[code]` | `apps/hairfit-app/app/salon/match/[code].tsx` | salon | inventory | Customer match invite acceptance. |
| `/admin` | `apps/hairfit-app/app/admin/index.tsx` | admin | ported | Reads admin overview through `/api/mobile/dashboard?service=admin`. |
| `/admin/stats` | `apps/hairfit-app/app/admin/stats.tsx` | admin | ported | Shows 30-day KPI and daily trend from mobile dashboard API. |
| `/admin/members` | `apps/hairfit-app/app/admin/members/index.tsx` | admin | inventory | Member list. |
| `/admin/members/[userId]` | `apps/hairfit-app/app/admin/members/[userId].tsx` | admin | inventory | Member detail and credit/account controls. |
| `/admin/reviews` | `apps/hairfit-app/app/admin/reviews.tsx` | admin | inventory | Review moderation. |
| `/admin/inbox` | `apps/hairfit-app/app/admin/inbox.tsx` | admin | inventory | Inbound support email. |
| `/admin/b2b` | `apps/hairfit-app/app/admin/b2b.tsx` | admin | inventory | B2B lead pipeline. |

## API Facade Work

| API area | Mobile owner | Status | Notes |
| --- | --- | --- | --- |
| `/api/mobile/me` | shared | ported | Uses shared mobile auth context and works before onboarding. |
| `/api/mobile/dashboard` | shared | ported | Role-aware customer, salon, and admin summary facade. |
| `/api/mobile/payments/prepare` | customer | ported | Creates pending PortOne mobile payment transactions. |
| `/api/mobile/payments/complete` | customer | ported | Verifies PortOne payment and grants credits idempotently. |
| `/api/mobile/aftercare` | customer | ported | Lists confirmed hair records for mobile aftercare. |
| `/api/mobile/aftercare/[hairRecordId]` | customer | ported | Returns a confirmed hair record and guide JSON for mobile aftercare detail. |
| Existing `/api/generations/*` | customer | ported | Customer mobile flow calls existing generation endpoints with Clerk bearer auth. |
| Existing `/api/styling/*` | customer | ported | Fashion recommendation and lookbook generation. |
| Existing `/api/salon/*` | salon | inventory | Salon CRM and matching. |
| Existing `/api/admin/*` | admin | inventory | Admin operations. |
