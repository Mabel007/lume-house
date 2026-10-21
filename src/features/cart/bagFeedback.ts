import type { CartFailureKind } from "./variantCartRepository";

export function bagAddedText(quantity: number, name: string, variantDetail: string): string {
  return `Added ${quantity} × ${variantDetail ? `${name} (${variantDetail})` : name} to your Cart`;
}
export function bagAddFailedText(name: string, failure: CartFailureKind): string {
  const lead = isUncertain(failure)
    ? `We couldn't confirm adding ${name} to your Cart.`
    : `We couldn't add ${name} to your Cart.`;
  return `${lead} ${BAG_FAILURE_GUIDANCE[failure]}`;
}
export function bagRemovedText(name: string, variantDetail: string): string {
  return `Removed ${variantDetail ? `${name} (${variantDetail})` : name} from your Cart`;
}
export function bagRemoveFailedText(name: string, failure: CartFailureKind): string {
  const lead = isUncertain(failure)
    ? `We couldn't confirm removing ${name} from your Cart.`
    : `We couldn't remove ${name} from your Cart.`;
  return `${lead} ${BAG_FAILURE_GUIDANCE[failure]}`;
}
export function bagUnavailableRemoveFailedText(index: number, failure: CartFailureKind): string {
  const lead = isUncertain(failure)
    ? `We couldn't confirm removing unavailable item ${index} from your Cart.`
    : `We couldn't remove unavailable item ${index} from your Cart.`;
  return `${lead} ${BAG_FAILURE_GUIDANCE[failure]}`;
}

/**
 * The actionable part of each failure. It never claims that the Cart is
 * unchanged: a lost answer can hide an applied change, so the only safe
 * instruction is to re-read the saved Cart before acting again.
 */
const BAG_FAILURE_GUIDANCE: Record<CartFailureKind, string> = {
  schema_not_ready:
    "Your saved Cart is still being updated and your items are kept. Please try again shortly.",
  cart_changed:
    "Your Cart changed in another session. Refresh your saved Cart to see the current items before trying again.",
  rejected: "Please try again in a moment.",
  uncertain:
    "Refresh your saved Cart to see the current items before trying again.",
};

/** The persistent recovery note shown next to the "Refresh saved Cart" action. */
export function bagRecoveryNote(failure: CartFailureKind): string {
  return failure === "cart_changed"
    ? "Your Cart changed in another session, so your saved Cart may be out of date."
    : "We couldn't confirm your last Cart change, so your saved Cart may be out of date.";
}

/** A failure that can leave the saved Cart out of date and needs reconciliation. */
export function bagFailureNeedsRefresh(failure: CartFailureKind): boolean {
  return failure === "uncertain" || failure === "cart_changed";
}

function isUncertain(failure: CartFailureKind): boolean {
  return failure === "uncertain" || failure === "cart_changed";
}
