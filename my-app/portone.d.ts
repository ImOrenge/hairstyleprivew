// 임시 타입 선언: npm install 후 @portone/browser-sdk 패키지 타입으로 대체됩니다.
declare module "@portone/browser-sdk/v2" {
  interface IssueBillingKeyOptions {
    storeId: string;
    channelKey?: string;
    billingKeyMethod: "CARD" | "EASY_PAY" | "MOBILE";
    issueId: string;
    issueName: string;
    displayAmount?: number;
    currency?: "KRW";
    customer?: {
      customerId?: string;
      fullName?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phoneNumber?: string;
    };
    customData?: Record<string, unknown>;
  }

  interface IssueBillingKeyResponse {
    billingKey?: string;
    code?: string;
    message?: string;
  }

  interface PaymentOptions {
    storeId: string;
    channelKey: string;
    paymentId: string;
    orderName: string;
    totalAmount: number;
    currency: "KRW";
    payMethod: "CARD";
    productType?: "DIGITAL";
    redirectUrl?: string;
    customer?: {
      customerId?: string;
      fullName?: string;
      email?: string;
      phoneNumber?: string;
    };
    customData?: Record<string, unknown>;
  }

  interface PaymentResponse {
    transactionType: "PAYMENT";
    txId: string;
    paymentId: string;
    code?: string;
    message?: string;
  }

  const PortOne: {
    requestIssueBillingKey(
      options: IssueBillingKeyOptions,
    ): Promise<IssueBillingKeyResponse>;
    requestPayment(options: PaymentOptions): Promise<PaymentResponse | undefined>;
  };

  export default PortOne;
}
