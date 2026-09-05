/** remaining_balance = max(0, final_price − payment_amount), rounded to paise. */
export function remainingBalance(finalPrice: unknown, paymentAmount: unknown): number {
  const total = parseFloat(String(finalPrice)) || 0;
  const collected = parseFloat(String(paymentAmount)) || 0;
  return Math.max(0, Math.round((total - collected) * 100) / 100);
}

export function withRemainingBalance<T extends { final_price: number; payment_amount: number }>(booking: T) {
  return {
    ...booking,
    remaining_balance: remainingBalance(booking.final_price, booking.payment_amount),
  };
}
