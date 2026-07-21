import type { StockDataProvider } from '../types';

const providers = new Map<string, StockDataProvider>();

export function registerProvider(provider: StockDataProvider): void {
  providers.set(provider.id, provider);
}

export function getProvider(id: string): StockDataProvider | undefined {
  return providers.get(id);
}

export function listProviders(): StockDataProvider[] {
  return Array.from(providers.values());
}

export function clearProviders(): void {
  providers.clear();
}
