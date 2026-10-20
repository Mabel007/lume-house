export function bagAddedText(quantity: number, name: string, variantDetail: string): string {
  return `Added ${quantity} × ${variantDetail ? `${name} (${variantDetail})` : name} to your Bag`;
}
export function bagAddFailedText(name: string): string {
  return `We couldn't confirm adding ${name} to your Bag. Check your Bag before trying again.`;
}
export function bagRemovedText(name: string, variantDetail: string): string {
  return `Removed ${variantDetail ? `${name} (${variantDetail})` : name} from your Bag`;
}
export function bagRemoveFailedText(name: string): string {
  return `We couldn't confirm removing ${name} from your Bag. Check your Bag before trying again.`;
}
