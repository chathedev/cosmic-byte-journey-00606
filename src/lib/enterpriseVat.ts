export const ENTERPRISE_VAT_RATE = 0.25;

const roundCurrency = (amountSek: number) => {
  // Keep SEK precision to two decimals
  return Math.round((amountSek + Number.EPSILON) * 100) / 100;
};

export const calcVat = (netAmountSek: number, vatRate = ENTERPRISE_VAT_RATE) => {
  return roundCurrency(netAmountSek * vatRate);
};

export const addVat = (netAmountSek: number, vatRate = ENTERPRISE_VAT_RATE) => {
  return roundCurrency(netAmountSek * (1 + vatRate));
};
