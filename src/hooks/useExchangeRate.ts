import { useState, useEffect, useCallback, useRef } from 'react';

interface ExchangeRateData {
  rate: number;
  lastUpdated: Date | null;
  loading: boolean;
  error: string | null;
}

// Cache exchange rate globally to avoid multiple fetches
let cachedRate: { rate: number; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useExchangeRate(fromCurrency: string = 'USD', toCurrency: string = 'SEK') {
  const [data, setData] = useState<ExchangeRateData>({
    rate: cachedRate?.rate ?? 10.5, // Use cached or fallback rate
    lastUpdated: cachedRate ? new Date(cachedRate.timestamp) : null,
    loading: !cachedRate,
    error: null,
  });
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchRate = useCallback(async () => {
    // Check cache first
    if (cachedRate && Date.now() - cachedRate.timestamp < CACHE_DURATION) {
      setData({
        rate: cachedRate.rate,
        lastUpdated: new Date(cachedRate.timestamp),
        loading: false,
        error: null,
      });
      return;
    }

    try {
      setData(prev => ({ ...prev, loading: true, error: null }));
      
      // Cancel any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();
      
      // Add timeout (5 seconds)
      const timeoutId = setTimeout(() => abortControllerRef.current?.abort(), 5000);
      
      const response = await fetch(
        `https://api.exchangerate-api.com/v4/latest/${fromCurrency}`,
        { signal: abortControllerRef.current.signal }
      );
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error('Failed to fetch exchange rate');
      }
      
      const result = await response.json();
      const rate = result.rates[toCurrency];
      
      if (!rate) {
        throw new Error(`Rate for ${toCurrency} not found`);
      }
      
      // Cache the rate
      cachedRate = { rate, timestamp: Date.now() };
      
      setData({
        rate,
        lastUpdated: new Date(),
        loading: false,
        error: null,
      });
    } catch (err) {
      // Don't log aborted requests
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Exchange rate fetch error:', err);
      }
      setData(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error && err.name !== 'AbortError' ? err.message : null,
      }));
    }
  }, [fromCurrency, toCurrency]);

  useEffect(() => {
    fetchRate();
    
    // Refresh rate every 5 minutes
    const interval = setInterval(fetchRate, 5 * 60 * 1000);
    
    return () => {
      clearInterval(interval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
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
