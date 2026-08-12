export interface PortOneBillingCustomer {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
}

export function buildPortoneBillingCustomer(customer: PortOneBillingCustomer) {
  const normalized = {
    id: customer.id.trim(),
    name: customer.name.trim(),
    email: customer.email.trim(),
    phoneNumber: customer.phoneNumber.trim(),
  };
  if (!normalized.id || !normalized.name || !normalized.email || !normalized.phoneNumber) {
    throw new Error("PortOne billing customer information is incomplete");
  }

  return {
    id: normalized.id,
    name: { full: normalized.name },
    email: normalized.email,
    phoneNumber: normalized.phoneNumber,
  };
}
