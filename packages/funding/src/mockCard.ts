export type MockCardChargeResult =
  | { ok: true; cardLast4: string; authorizationId: string }
  | { ok: false; reason: string };

export function chargeMockCard(input: {
  cardNumber: string;
  expiry: string;
  cvc: string;
  amountUsd: number;
}): MockCardChargeResult {
  const normalizedCard = input.cardNumber.replace(/\s+/g, "");

  if (!/^\d{16}$/.test(normalizedCard)) {
    return { ok: false, reason: "card number must be 16 digits" };
  }

  if (!passesLuhn(normalizedCard)) {
    return { ok: false, reason: "card number failed validation" };
  }

  if (!/^\d{2}\/\d{2}$/.test(input.expiry)) {
    return { ok: false, reason: "expiry must be MM/YY" };
  }

  if (!/^\d{3,4}$/.test(input.cvc)) {
    return { ok: false, reason: "cvc must be 3 or 4 digits" };
  }

  if (normalizedCard === "4000000000000002") {
    return { ok: false, reason: "mock processor declined the card" };
  }

  return {
    ok: true,
    cardLast4: normalizedCard.slice(-4),
    authorizationId: `auth_${Date.now().toString(36)}`
  };
}

function passesLuhn(value: string): boolean {
  let sum = 0;
  let shouldDouble = false;

  for (let index = value.length - 1; index >= 0; index -= 1) {
    let digit = Number(value[index]);

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}
