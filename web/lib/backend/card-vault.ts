export function sealCard(cardObj: any): any {
  // Simple pass-through for sandbox migration. 
  // TODO: Port actual AES-GCM vaulting if required.
  return cardObj;
}

export function openCard(order: any): any {
  if (order.cardNumber) {
    return {
      number: order.cardNumber,
      cvv: order.cardCvv,
      expiry: order.cardExpiry,
      brand: order.cardBrand,
    };
  }
  return null;
}
