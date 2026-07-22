# Automatic modal coordinator contract

## Purpose

`Dialog` owns one modal's focus, keyboard, portal, and scroll behavior. `useCoordinatedModal` decides which automatically requested modal may be visible when more than one feature asks to open at the same time.

Source: `my-app/lib/modal-coordinator.ts`

## Current priority

| Modal | ID | Priority | Reason |
| --- | --- | ---: | --- |
| Subscription payment notice | `subscription-payment-notice` | 200 | Service availability must be understood before account setup or checkout actions. |
| Account setup prompt | `account-setup-prompt` | 100 | It opens after the higher-priority service notice is dismissed or already acknowledged. |

## Invariants

- Only one requested automatic modal is active.
- Higher priority wins; equal priorities preserve first request order.
- A closed request never blocks the next request.
- Removing or dismissing the active request immediately releases the next eligible request.
- Manual, user-triggered dialogs are not queued here. Their trigger cannot be reached while an automatic modal is trapping focus.
- The coordinator does not render UI, mutate feature state, or replace `Dialog` keyboard behavior.

## Usage

```tsx
const requestedOpen = shouldPrompt && !dismissed;
const open = useCoordinatedModal({
  id: "account-setup-prompt",
  priority: AUTOMATIC_MODAL_PRIORITY.accountSetupPrompt,
  requestedOpen,
});

return <Dialog open={open} onOpenChange={handleOpenChange}>...</Dialog>;
```

Call the hook unconditionally. Keep the feature's requested/dismissed state in the feature component, and pass only the coordinated boolean to `Dialog`.

## Validation

- `npm run dialog-accessibility:contract:test`
- Public `Dialog` keyboard and responsive browser smoke
- Authenticated home sequence: subscription notice first, then account setup prompt, with never more than one `[role="dialog"]`

The authenticated sequence remains a Phase 12B/13 runtime gate; the pure priority/order contract is covered locally.
