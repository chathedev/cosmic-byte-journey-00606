import { useState, useEffect, useCallback } from 'react';

interface ExchangeRateData {
  rate: number;
  lastUpdated: Date | null;
  loading: boolean;
  error: string | null;
}

export function useExchangeRate(fromCurrency: string = 'USD', toCurrency: string = 'SEK') {
  const [data, setData] = useState<ExchangeRateData>({
    rate: 10.5, // Fallback rate
    lastUpdated: null,
    loading: true,
    error: null,
  });

  const fetchRate = useCallback(async () => {
    try {
      setData(prev => ({ ...prev, loading: true, error: null }));
      
      // Using exchangerate-api.com free tier (no API key needed for basic usage)
      const response = await fetch(
        `https://api.exchangerate-api.com/v4/latest/${fromCurrency}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch exchange rate');
      }
      
      const result = await response.json();
      const rate = result.rates[toCurrency];
      
      if (!rate) {
        throw new Error(`Rate for ${toCurrency} not found`);
      }
      
      setData({
        rate,
        lastUpdated: new Date(),
        loading: false,
        error: null,
      });
    } catch (err) {
      console.error('Exchange rate fetch error:', err);
      setData(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, [fromCurrency, toCurrency]);

  useEffect(() => {
    fetchRate();
    
    // Refresh rate every 5 minutes
    const interval = setInterval(fetchRate, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchRate]);

  const convert = useCallback((amountUsd: number): number => {
    return amountUsd * data.rate;
  }, [data.rate]);

  return {
    ...data,
    convert,
    refresh: fetchRate,
  };
}
