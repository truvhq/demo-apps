declare global {
  interface TruvBridgeOptions {
    bridgeToken: string;
    isOrder?: boolean;
    companyMappingId?: string;
    position?: { type: string; container: HTMLElement };
    onLoad?: () => void;
    onEvent?: (type: string, _data: unknown, source: string) => void;
    onSuccess?: (token?: string) => void;
    onClose?: () => void;
  }

  interface TruvBridgeInstance {
    open(): void;
    close(): void;
  }

  interface Window {
    TruvBridge?: {
      init(opts: TruvBridgeOptions): TruvBridgeInstance;
    };
  }
}

export {};
