export {};

declare global {
  interface Window {
    readonly signalScape?: Readonly<{
      apiVersion: 1;
    }>;
  }
}
