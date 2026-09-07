/// <reference types="vitest/globals" />

import type { Mock } from 'vitest';

declare global {
  namespace Vi {
    interface Mock<T = any> {
      (args: any): T;
      mockResolvedValue: (value: T) => Mock<T>;
      mockResolvedValueOnce: (value: T) => Mock<T>;
      mockRejectedValue: (value: any) => Mock<T>;
      mockImplementation: (fn: (...args: any[]) => any) => Mock<T>;
      mockReturnValue: (value: T) => Mock<T>;
      mockReturnValueOnce: (value: T) => Mock<T>;
    }
  }

  const vi: {
    mock: (moduleName: string, factory: () => any) => void;
    fn: <T>(implementation?: (...args: any[]) => T) => Vi.Mock<T>;
    clearAllMocks: () => void;
    resetAllMocks: () => void;
    restoreAllMocks: () => void;
    spyOn: <T, K extends keyof T>(object: T, method: K) => Vi.Mock<T[K]>;
    mocked: <T>(obj: T, deep?: boolean) => Vi.Mocked<T>;
  };
}