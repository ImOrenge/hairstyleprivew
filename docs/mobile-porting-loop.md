# Mobile Porting Iteration Loop

This repo now treats mobile porting as a repeatable loop instead of a one-time rewrite. Run it from the repository root:

```bash
npm run mobile:loop
```

## Loop

1. Inventory the source web route and its API calls.
2. Capture the current web behavior: navigation, loading, empty, success, error, unauthorized, and role-gated states.
3. Port the screen into the owning Expo app.
4. Move reusable contracts into `packages/shared` and network calls into `packages/api-client`.
5. Verify native behavior with the same state checklist before starting the next route.

## Apps

- `apps/customer-mobile`: public/customer flow, auth, onboarding, upload, generation, results, fashion, aftercare, my page, legal content.
- `apps/salon-mobile`: salon customer CRM, matching, visits, aftercare tasks.
- `apps/admin-mobile`: admin stats, members, reviews, inbound mail, B2B leads, catalog operations.

## Guardrails

- Keep `my-app` as the production web/backend app for now.
- Do not expose Supabase service-role secrets to mobile apps.
- Mobile apps call the Next API with Clerk mobile session tokens.
- PortOne is isolated behind `packages/payments-portone` so the payment provider can be replaced if store review requires IAP later.
- Each ported route must update `docs/mobile-port-map.md`.
