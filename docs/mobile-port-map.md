# Web To Mobile Port Map

Status values:

- `inventory`: web route identified, native work not started.
- `scaffolded`: native route placeholder exists.
- `ported`: native UI and API behavior implemented.
- `verified`: native states tested against the web source route.

## Customer App

| Web route | Mobile target | Status | Notes |
| --- | --- | --- | --- |
| `/` | `apps/customer-mobile/app/index.tsx` | scaffolded | Landing/home hub with CTA into upload and account flows. |
| `/login/[[...rest]]` | `apps/customer-mobile/app/(auth)/login.tsx` | ported | Clerk Expo email/password sign-in with session activation. |
| `/signup/[[...rest]]` | `apps/customer-mobile/app/(auth)/signup.tsx` | ported | Clerk Expo sign-up, email-code verification, onboarding handoff. |
| `/onboarding` | `apps/customer-mobile/app/onboarding.tsx` | ported | Member onboarding posts to existing `/api/onboarding`. |
| `/upload` | `apps/customer-mobile/app/upload.tsx` | ported | Native image picker creates the data URL used by recommendation APIs. |
| `/generate` | `apps/customer-mobile/app/generate.tsx` | ported | Calls `/api/prompts/generate` and `/api/generations/run`. |
| `/generate/[id]` | `apps/customer-mobile/app/generate/[id].tsx` | ported | 3x3 recommendation board, analysis summary, render retry, and result handoff. |
| `/result/[id]` | `apps/customer-mobile/app/result/[id].tsx` | ported | Loads generation result and saves selected variant. |
| `/styler/new` | `apps/customer-mobile/app/styler/new.tsx` | ported | Fashion recommendation wizard with profile, body photo, hair selection, genre, recommend, and generate states. |
| `/styler/[id]` | `apps/customer-mobile/app/styler/[id].tsx` | ported | Fashion lookbook result detail. |
| `/mypage` | `apps/customer-mobile/app/mypage.tsx` | ported | Mobile dashboard, generation history, and PortOne billing entry. |
| `/payments/complete` | `apps/customer-mobile/app/payments/complete.tsx` | ported | Deep-link payment completion and server verification. |
| `/aftercare` | `apps/customer-mobile/app/aftercare.tsx` | ported | Hair care list through mobile aftercare API. |
| `/aftercare/[hairRecordId]` | `apps/customer-mobile/app/aftercare/[hairRecordId].tsx` | ported | Hair care detail through mobile aftercare API. |
| `/privacy-policy` | `apps/customer-mobile/app/legal/privacy.tsx` | ported | Native legal page from web legal structure. |
| `/terms-of-service` | `apps/customer-mobile/app/legal/terms.tsx` | ported | Native legal page from web legal structure. |

## Salon App

| Web route | Mobile target | Status | Notes |
| --- | --- | --- | --- |
| `/salon/customers` | `apps/salon-mobile/app/customers/index.tsx` | ported | Reads customer summary through `/api/mobile/dashboard?service=salon`. |
| `/salon/customers/[id]` | `apps/salon-mobile/app/customers/[id].tsx` | inventory | Customer detail, visits, aftercare tasks. |
| `/salon/match/[code]` | `apps/salon-mobile/app/match/[code].tsx` | inventory | Customer match invite acceptance. |

## Admin App

| Web route | Mobile target | Status | Notes |
| --- | --- | --- | --- |
| `/admin` | `apps/admin-mobile/app/index.tsx` | ported | Reads admin overview through `/api/mobile/dashboard?service=admin`. |
| `/admin/stats` | `apps/admin-mobile/app/stats.tsx` | ported | Shows 30-day KPI and daily trend from mobile dashboard API. |
| `/admin/members` | `apps/admin-mobile/app/members/index.tsx` | inventory | Member list. |
| `/admin/members/[userId]` | `apps/admin-mobile/app/members/[userId].tsx` | inventory | Member detail and credit/account controls. |
| `/admin/reviews` | `apps/admin-mobile/app/reviews.tsx` | inventory | Review moderation. |
| `/admin/inbox` | `apps/admin-mobile/app/inbox.tsx` | inventory | Inbound support email. |
| `/admin/b2b` | `apps/admin-mobile/app/b2b.tsx` | inventory | B2B lead pipeline. |

## API Facade Work

| API area | Mobile owner | Status | Notes |
| --- | --- | --- | --- |
| `/api/mobile/me` | shared | ported | Uses shared mobile auth context and works before onboarding. |
| `/api/mobile/dashboard` | shared | ported | Role-aware customer, salon, and admin summary facade. |
| `/api/mobile/payments/prepare` | shared | ported | Creates pending PortOne mobile payment transactions. |
| `/api/mobile/payments/complete` | shared | ported | Verifies PortOne payment, updates subscription metadata, grants credits idempotently. |
| `/api/mobile/aftercare` | customer | ported | Lists confirmed hair records for mobile aftercare. |
| `/api/mobile/aftercare/[hairRecordId]` | customer | ported | Returns a confirmed hair record and guide JSON for mobile aftercare detail. |
| Existing `/api/generations/*` | customer | ported | Customer mobile flow calls existing generation endpoints with Clerk bearer auth. |
| Existing `/api/styling/*` | customer | ported | Fashion recommendation and lookbook generation. |
| Existing `/api/salon/*` | salon | inventory | Salon CRM and matching. |
| Existing `/api/admin/*` | admin | inventory | Admin operations. |
