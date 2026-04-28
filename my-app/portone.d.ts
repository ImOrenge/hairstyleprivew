// 임시 타입 선언: npm install 후 @portone/browser-sdk 패키지 타입으로 대체됩니다.
declare module "@portone/browser-sdk/v2" {
  interface IssueBillingKeyOptions {
    storeId: string;
    channelKey: string;
    billingKeyMethod: "CARD" | "EASY_PAY" | "MOBILE";
    issueId: string;
    issueName: string;
    customer?: {
      customerId?: string;
      fullName?: string;
      email?: string;
      phoneNumber?: string;
    };
  }

  interface IssueBillingKeyResponse {
    billingKey?: string;
    code?: string;
    message?: string;
  }

  const PortOne: {
    requestIssueBillingKey(
      options: IssueBillingKeyOptions,
    ): Promise<IssueBillingKeyResponse>;
  };

  export default PortOne;
}
