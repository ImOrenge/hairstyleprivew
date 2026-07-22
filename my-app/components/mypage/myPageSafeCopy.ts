function isCardDeclineCode(code: string) {
  return /CARD|DECLIN|DENIED|REJECT/.test(code.trim().toUpperCase());
}

export function getSafePaymentFailureCopy(code: string, hasFailure: boolean) {
  if (!hasFailure) return null;
  const normalizedCode = code.trim().toUpperCase();
  if (isCardDeclineCode(normalizedCode)) {
    return "카드 승인이 거절되었습니다. 카드 상태를 확인하거나 다른 카드로 다시 시도해 주세요.";
  }
  if (/TIMEOUT|NETWORK|TEMPORARY|UNAVAILABLE/.test(normalizedCode)) {
    return "결제 확인이 지연되고 있습니다. 새 결제를 시작하지 말고 잠시 후 상태를 다시 확인해 주세요.";
  }
  return "결제를 완료하지 못했습니다. 카드 상태를 확인하거나 잠시 후 다시 시도해 주세요.";
}

export function getSafeSubscriptionFailureCopy(code: string, hasFailure: boolean) {
  if (!hasFailure) return null;
  if (isCardDeclineCode(code)) {
    return "구독 카드 승인이 거절되었습니다. 카드 상태를 확인해 주세요.";
  }
  return "구독 결제를 확인하지 못했습니다. 잠시 후 결제 상태를 다시 확인해 주세요.";
}

export function getSafeRefundFailureCopy(hasFailure: boolean) {
  if (!hasFailure) return null;
  return "환불 처리를 완료하지 못했습니다. 잠시 후 상태를 다시 확인해 주세요.";
}
