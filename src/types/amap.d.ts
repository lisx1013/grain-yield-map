/* eslint-disable @typescript-eslint/no-explicit-any */
export {};

declare global {
  interface Window {
    _AMapSecurityConfig: {
      securityJsCode: string;
    };
    AMap: any;
  }
}
