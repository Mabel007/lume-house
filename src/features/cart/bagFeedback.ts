export function bagAddedText(quantity: number, name: string, variantDetail: string): string {
  return `Added ${quantity} × ${variantDetail ? `${name} (${variantDetail})` : name} to your Bag`;
}
export function bagAddFailedText(name: string): string {
  return `${name} was not added to your Bag.`;
}
export function bagRemovedText(name: string, variantDetail: string): string {
  return `Removed ${variantDetail ? `${name} (${variantDetail})` : name} from your Bag`;
}
export function bagRemoveFailedText(name: string): string {
  return `${name} was not removed from your Bag.`;
}
