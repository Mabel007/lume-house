export const shop = {
 name: "Lumé House", tagline: "Beautiful things live here.", currency: "NLE", locale: "en-SL", countryCode: "SLE",
 phone: "+232 76 521207", email: "hello@lumehouse.sl", location: "Lumley, Freetown, Sierra Leone",
 heroTitle: "Beautiful things\nlive here.", heroDescription: "Warm textures, sculptural details and home essentials for considered living in Freetown.",
};
export function formatMoney(minorUnits: number): string {
 if (!Number.isSafeInteger(minorUnits)) throw new Error("Money must use integer minor units");
 return `${shop.currency} ${new Intl.NumberFormat("en-GB", { minimumFractionDigits: minorUnits % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(minorUnits / 100)}`;
}
