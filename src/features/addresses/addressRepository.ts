import type { SupabaseClient } from '@supabase/supabase-js';

export type SavedAddress = {
  id: string;
  customer_id: string;
  label: string;
  street_address: string;
  area: string;
  city: string;
  zone_id: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type NewAddress = {
  label: string;
  street_address: string;
  area: string;
  city: string;
  zone_id: string;
  is_default?: boolean;
};

const VALID_ZONES = ['zone-1', 'zone-2', 'zone-3'] as const;
const SERVICE_CITY = 'Freetown';

function validateZone(zoneId: string, city: string): void {
  if (!VALID_ZONES.includes(zoneId as typeof VALID_ZONES[number])) {
    throw new Error('Invalid delivery zone.');
  }
  if (city.trim().toLowerCase() !== SERVICE_CITY.toLowerCase()) {
    throw new Error('Delivery is only available in Freetown.');
  }
}

export async function listAddresses(
  client: SupabaseClient,
  customerId: string
): Promise<SavedAddress[]> {
  const { data, error } = await client
    .from('customer_addresses')
    .select('*')
    .eq('customer_id', customerId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  
  if (error) throw new Error('Could not load addresses.');
  return data || [];
}

export async function getAddress(
  client: SupabaseClient,
  addressId: string,
  customerId: string
): Promise<SavedAddress | null> {
  const { data, error } = await client
    .from('customer_addresses')
    .select('*')
    .eq('id', addressId)
    .eq('customer_id', customerId)
    .maybeSingle();
  
  if (error) throw new Error('Could not load address.');
  return data;
}

export async function createAddress(
  client: SupabaseClient,
  customerId: string,
  address: NewAddress
): Promise<SavedAddress> {
  validateZone(address.zone_id, address.city);
  
  // Ownership is derived from auth.uid() by the RPC, never from this UI ID.
  if (!customerId) throw new Error('Authentication required.');
  const {data, error} = await client.rpc('save_customer_address', {p_address_id: null, p_address: address});
  
  if (error) {
    if (error.code === '23514') {
      throw new Error('Maximum 5 addresses reached.');
    }
    if (error.code === '23505') {
      throw new Error('An address with this label already exists.');
    }
    throw new Error('Could not save address.');
  }
  
  return data;
}

export async function updateAddress(
  client: SupabaseClient,
  addressId: string,
  customerId: string,
  updates: Partial<NewAddress>
): Promise<SavedAddress> {
  const current = await getAddress(client, addressId, customerId);
  if (!current) throw new Error('Address not found.');
  
  const newZoneId = updates.zone_id ?? current.zone_id;
  const newCity = updates.city ?? current.city;
  validateZone(newZoneId, newCity);
  
  const {data, error} = await client.rpc('save_customer_address', {p_address_id: addressId, p_address: updates});
  
  if (error) {
    if (error.code === '23505') {
      throw new Error('An address with this label already exists.');
    }
    throw new Error('Could not update address.');
  }
  
  return data;
}

export async function deleteAddress(
  client: SupabaseClient,
  addressId: string,
  customerId: string
): Promise<void> {
  const { error } = await client
    .from('customer_addresses')
    .delete()
    .eq('id', addressId)
    .eq('customer_id', customerId);
  
  if (error) throw new Error('Could not delete address.');
}

export async function setDefaultAddress(
  client: SupabaseClient,
  addressId: string,
  customerId: string
): Promise<void> {
  // Verify ownership before calling RPC (defense in depth)
  const address = await getAddress(client, addressId, customerId);
  if (!address) {
    throw new Error('Address not found.');
  }
  
  const { error } = await client.rpc('set_default_address', {
    p_address_id: addressId,
  });
  
  if (error) {
    if (error.message === 'address_not_found') {
      throw new Error('Address not found.');
    }
    if (error.message === 'forbidden') {
      throw new Error('Not authorized to modify this address.');
    }
    throw new Error('Could not set default address.');
  }
}

export function validateAddressForCheckout(
  address: SavedAddress,
  activeZones: ReadonlyArray<{ id: string; active: boolean }>
): boolean {
  const zone = activeZones.find(z => z.id === address.zone_id);
  return zone?.active === true && address.city.trim().toLowerCase() === SERVICE_CITY.toLowerCase();
}
