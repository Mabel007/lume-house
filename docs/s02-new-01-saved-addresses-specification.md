# S02-NEW-01 Saved Addresses — Implementation Specification

**Date:** 2026-11-03  
**Status:** SPECIFICATION COMPLETE, PENDING IMPLEMENTATION  
**Estimated effort:** 1-2 days  
**Authorization:** Not yet authorized — requires separate implementation approval

---

## Executive Summary

Specification for saved addresses feature allowing customers to store up to 5 delivery addresses with labels (Home/Work/custom). Manual entry only, no automatic detection or geocoding. Integrates with existing checkout flow.

---

## Requirements

### Functional Requirements

1. **Address storage:**
   - Max 5 addresses per customer
   - Each address has: label, street, area, city, zone (derived)
   - Labels: "Home", "Work", or custom (max 20 chars)
   - One address can be marked as default

2. **CRUD operations:**
   - Create: Add new address (manual entry)
   - Read: List saved addresses, get single address
   - Update: Edit address details or label
   - Delete: Remove address (with confirmation)

3. **Checkout integration:**
   - Select from saved addresses during checkout
   - Pre-fill delivery fields with selected address
   - Option to save new address during checkout
   - Option to enter one-time address (not saved)

4. **Validation:**
   - All fields required (street, area, city)
   - Max 200 chars per field
   - Sierra Leone only (country enforcement from S02-01)
   - Zone derivation from area/city (existing logic)

5. **Security:**
   - Owner-scoped access (RLS on customer_id)
   - No shared addresses between customers
   - Audit log for address changes (optional)

### Non-Functional Requirements

1. **Performance:**
   - Address list loads in < 200ms
   - Checkout pre-fill is instant
   - No N+1 queries

2. **Accessibility:**
   - Keyboard navigation for address selection
   - Screen reader labels for address cards
   - Focus management for modals/forms

3. **Responsive:**
   - Mobile-first address list
   - Touch-friendly edit/delete buttons
   - Collapsible address form on small screens

---

## Database Schema

### New Table: `customer_addresses`

```sql
create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 20),
  street_address text not null check (char_length(street_address) between 1 and 200),
  area text not null check (char_length(area) between 1 and 200),
  city text not null check (char_length(city) between 1 and 200),
  zone_id text not null references public.zones(id),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Max 5 addresses per customer enforced by trigger
  -- Only one default per customer enforced by partial unique index
  constraint customer_addresses_customer_label_unique 
    unique (customer_id, label)
);

-- Partial unique index: only one default address per customer
create unique index customer_addresses_default_idx 
  on public.customer_addresses (customer_id) 
  where is_default = true;

-- Index for fast lookup by customer
create index customer_addresses_customer_idx 
  on public.customer_addresses (customer_id);

-- RLS: owner-scoped access only
alter table public.customer_addresses enable row level security;

create policy "Customers can view their own addresses"
  on public.customer_addresses for select
  to authenticated
  using (customer_id = auth.uid());

create policy "Customers can insert their own addresses"
  on public.customer_addresses for insert
  to authenticated
  with check (customer_id = auth.uid());

create policy "Customers can update their own addresses"
  on public.customer_addresses for update
  to authenticated
  using (customer_id = auth.uid());

create policy "Customers can delete their own addresses"
  on public.customer_addresses for delete
  to authenticated
  using (customer_id = auth.uid());

-- Revoke public access
revoke all on public.customer_addresses from public, anon;
grant select, insert, update, delete on public.customer_addresses to authenticated;

-- Trigger: enforce max 5 addresses per customer
create or replace function public.enforce_address_limit()
returns trigger language plpgsql as $$
declare
  address_count integer;
begin
  if TG_OP = 'INSERT' then
    select count(*) into address_count
    from public.customer_addresses
    where customer_id = NEW.customer_id;
    
    if address_count >= 5 then
      raise exception 'Maximum 5 addresses per customer'
        using errcode = '23514';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger customer_addresses_limit_check
  before insert on public.customer_addresses
  for each row execute function public.enforce_address_limit();

-- Trigger: updated_at timestamp
create trigger customer_addresses_updated_at
  before update on public.customer_addresses
  for each row execute function public.set_commerce_updated_at();
```

### Migration File

**Name:** `20261103000000_customer_addresses.sql`  
**Location:** `supabase/migrations/`  
**Dependencies:** S02-01 country enforcement (zone derivation)

---

## Backend Functions

### TypeScript API

**File:** `src/features/addresses/addressRepository.ts`

```typescript
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
  is_default?: boolean;
};

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
  // Derive zone from area/city
  const zoneId = deriveZone(address.area, address.city);
  if (!zoneId) throw new Error('Delivery not available in this area.');
  
  const { data, error } = await client
    .from('customer_addresses')
    .insert({
      customer_id: customerId,
      label: address.label,
      street_address: address.street_address,
      area: address.area,
      city: address.city,
      zone_id: zoneId,
      is_default: address.is_default ?? false,
    })
    .select()
    .single();
  
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
  
  const zoneId = updates.area && updates.city
    ? deriveZone(updates.area, updates.city)
    : current.zone_id;
  
  if (updates.area && updates.city && !zoneId) {
    throw new Error('Delivery not available in this area.');
  }
  
  const { data, error } = await client
    .from('customer_addresses')
    .update({
      ...(updates.label && { label: updates.label }),
      ...(updates.street_address && { street_address: updates.street_address }),
      ...(updates.area && { area: updates.area }),
      ...(updates.city && { city: updates.city }),
      ...(zoneId && { zone_id: zoneId }),
      ...(updates.is_default !== undefined && { is_default: updates.is_default }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', addressId)
    .eq('customer_id', customerId)
    .select()
    .single();
  
  if (error) throw new Error('Could not update address.');
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
  // Clear existing default
  await client
    .from('customer_addresses')
    .update({ is_default: false })
    .eq('customer_id', customerId);
  
  // Set new default
  const { error } = await client
    .from('customer_addresses')
    .update({ is_default: true })
    .eq('id', addressId)
    .eq('customer_id', customerId);
  
  if (error) throw new Error('Could not set default address.');
}

// Helper: derive zone from area/city (reuse existing logic)
function deriveZone(area: string, city: string): string | null {
  // Import from existing zone derivation logic
  // See src/features/checkout/validation.ts
  return null; // Placeholder
}
```

---

## Frontend Components

### Address Management UI

**File:** `src/features/addresses/AddressManager.tsx`

```typescript
import { useState, useEffect } from 'react';
import { listAddresses, createAddress, updateAddress, deleteAddress, setDefaultAddress, type SavedAddress, type NewAddress } from './addressRepository';
import { getSupabaseClient } from '../../lib/supabase/client';
import { useAuth } from '../auth/AuthContext';

export function AddressManager() {
  const { session } = useAuth();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SavedAddress | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (session?.user) {
      loadAddresses();
    }
  }, [session]);

  async function loadAddresses() {
    try {
      const data = await listAddresses(getSupabaseClient(), session!.user.id);
      setAddresses(data);
    } catch (error) {
      console.error('Failed to load addresses:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(address: NewAddress) {
    await createAddress(getSupabaseClient(), session!.user.id, address);
    await loadAddresses();
    setShowForm(false);
  }

  async function handleUpdate(addressId: string, updates: Partial<NewAddress>) {
    await updateAddress(getSupabaseClient(), addressId, session!.user.id, updates);
    await loadAddresses();
    setEditing(null);
  }

  async function handleDelete(addressId: string) {
    if (!confirm('Delete this address?')) return;
    await deleteAddress(getSupabaseClient(), addressId, session!.user.id);
    await loadAddresses();
  }

  async function handleSetDefault(addressId: string) {
    await setDefaultAddress(getSupabaseClient(), addressId, session!.user.id);
    await loadAddresses();
  }

  if (loading) return <div>Loading addresses...</div>;

  return (
    <div className="address-manager">
      <h2>Saved Addresses</h2>
      <p>{addresses.length} of 5 addresses used</p>
      
      {addresses.length < 5 && (
        <button onClick={() => setShowForm(true)}>Add New Address</button>
      )}

      {showForm && (
        <AddressForm
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="address-list">
        {addresses.map(address => (
          <AddressCard
            key={address.id}
            address={address}
            onEdit={() => setEditing(address)}
            onDelete={() => handleDelete(address.id)}
            onSetDefault={() => handleSetDefault(address.id)}
          />
        ))}
      </div>

      {editing && (
        <AddressForm
          address={editing}
          onSubmit={(updates) => handleUpdate(editing.id, updates)}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function AddressCard({ address, onEdit, onDelete, onSetDefault }) {
  return (
    <div className={`address-card ${address.is_default ? 'default' : ''}`}>
      <div className="address-label">
        {address.label}
        {address.is_default && <span className="default-badge">Default</span>}
      </div>
      <div className="address-details">
        <p>{address.street_address}</p>
        <p>{address.area}, {address.city}</p>
      </div>
      <div className="address-actions">
        {!address.is_default && (
          <button onClick={onSetDefault}>Set as Default</button>
        )}
        <button onClick={onEdit}>Edit</button>
        <button onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

function AddressForm({ address, onSubmit, onCancel }) {
  const [label, setLabel] = useState(address?.label || '');
  const [street, setStreet] = useState(address?.street_address || '');
  const [area, setArea] = useState(address?.area || '');
  const [city, setCity] = useState(address?.city || '');

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({
      label,
      street_address: street,
      area,
      city,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="address-form">
      <h3>{address ? 'Edit Address' : 'New Address'}</h3>
      
      <label>
        Label (Home, Work, or custom)
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={20}
          required
        />
      </label>

      <label>
        Street Address
        <input
          type="text"
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          maxLength={200}
          required
        />
      </label>

      <label>
        Area
        <input
          type="text"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          maxLength={200}
          required
        />
      </label>

      <label>
        City
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          maxLength={200}
          required
        />
      </label>

      <div className="form-actions">
        <button type="submit">Save</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
```

### Checkout Integration

**File:** `src/features/checkout/CheckoutPage.tsx` (modify existing)

```typescript
// Add address selection to checkout
import { listAddresses, type SavedAddress } from '../addresses/addressRepository';

export function CheckoutPage() {
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [saveNewAddress, setSaveNewAddress] = useState(false);
  const [newAddressLabel, setNewAddressLabel] = useState('Home');

  useEffect(() => {
    if (session?.user) {
      listAddresses(getSupabaseClient(), session.user.id)
        .then(setSavedAddresses)
        .catch(console.error);
    }
  }, [session]);

  function handleAddressSelect(addressId: string) {
    const address = savedAddresses.find(a => a.id === addressId);
    if (address) {
      // Pre-fill checkout form
      setFieldValue('delivery_street_address', address.street_address);
      setFieldValue('delivery_area', address.area);
      setFieldValue('delivery_city', address.city);
      setSelectedAddressId(addressId);
    }
  }

  return (
    <div className="checkout-page">
      {savedAddresses.length > 0 && (
        <section className="saved-addresses">
          <h3>Deliver to saved address</h3>
          <div className="address-selector">
            {savedAddresses.map(address => (
              <label key={address.id} className="address-option">
                <input
                  type="radio"
                  name="saved-address"
                  value={address.id}
                  checked={selectedAddressId === address.id}
                  onChange={() => handleAddressSelect(address.id)}
                />
                <div className="address-preview">
                  <strong>{address.label}</strong>
                  <p>{address.street_address}</p>
                  <p>{address.area}, {address.city}</p>
                </div>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Existing checkout form */}
      <section className="delivery-details">
        <h3>Or enter new delivery address</h3>
        {/* ... existing form fields ... */}
        
        <label className="save-address-checkbox">
          <input
            type="checkbox"
            checked={saveNewAddress}
            onChange={(e) => setSaveNewAddress(e.target.checked)}
          />
          Save this address for future orders
        </label>

        {saveNewAddress && (
          <input
            type="text"
            placeholder="Label (Home, Work, or custom)"
            value={newAddressLabel}
            onChange={(e) => setNewAddressLabel(e.target.value)}
            maxLength={20}
          />
        )}
      </section>
    </div>
  );
}
```

---

## Tests

### Unit Tests

**File:** `tests/addresses.test.mjs`

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listAddresses, createAddress, updateAddress, deleteAddress, setDefaultAddress } from '../src/features/addresses/addressRepository.ts';

test('customer can create up to 5 addresses', async () => {
  // Setup test client
  // Create 5 addresses
  // Verify 6th creation fails with 'Maximum 5 addresses reached'
});

test('customer can set one default address', async () => {
  // Create 2 addresses
  // Set first as default
  // Set second as default
  // Verify first is no longer default
});

test('customer cannot access other customer addresses', async () => {
  // Create address for customer A
  // Try to read/update/delete as customer B
  // Verify RLS blocks access
});

test('address label must be unique per customer', async () => {
  // Create address with label "Home"
  // Try to create second address with label "Home"
  // Verify fails with 'An address with this label already exists'
});

test('zone is derived from area and city', async () => {
  // Create address with Lumley area, Freetown city
  // Verify zone_id is set correctly
});
```

### Integration Tests

**File:** `tests/checkout-addresses.test.mjs`

```javascript
test('checkout pre-fills from saved address', async () => {
  // Create saved address
  // Navigate to checkout
  // Select saved address
  // Verify form fields pre-filled
});

test('checkout can save new address', async () => {
  // Fill checkout form
  // Check "Save this address"
  // Submit order
  // Verify address saved to customer_addresses
});

test('checkout works without saved addresses', async () => {
  // Navigate to checkout with no saved addresses
  // Fill form manually
  // Submit order
  // Verify order placed successfully
});
```

---

## Rollback Plan

**If issues arise:**
1. Disable address selection UI (feature flag)
2. Keep database table (no data loss)
3. Revert frontend changes
4. Existing checkout flow unaffected

**To disable the feature:**
```sql
-- Revoke access to the table (preserves data)
revoke all on public.customer_addresses from authenticated;
```

**Impact:** Customers cannot access saved addresses, but data is preserved for future re-enablement.

**DO NOT** use `DROP TABLE ... CASCADE` as this would permanently delete customer data.

---

## Acceptance Criteria

### Functional

- [ ] Customer can create up to 5 addresses
- [ ] Customer can edit/delete saved addresses
- [ ] Customer can set one default address
- [ ] Address labels are unique per customer
- [ ] Zone is derived from area/city
- [ ] Checkout can select from saved addresses
- [ ] Checkout can save new address
- [ ] Checkout works without saved addresses

### Security

- [ ] RLS enforces owner-scoped access
- [ ] No cross-customer address access
- [ ] Max 5 addresses enforced by trigger
- [ ] Only one default per customer (partial unique index)

### Accessibility

- [ ] Keyboard navigation for address selection
- [ ] Screen reader labels for address cards
- [ ] Focus management for modals/forms
- [ ] Touch-friendly buttons (min 44px)

### Performance

- [ ] Address list loads in < 200ms
- [ ] Checkout pre-fill is instant
- [ ] No N+1 queries

### Tests

- [ ] Unit tests for repository functions
- [ ] Integration tests for checkout flow
- [ ] RLS tests for owner-scoped access
- [ ] Validation tests for address limits

---

## Migration Path

**Phase 1: Database schema**
- Create `customer_addresses` table
- Add RLS policies
- Add triggers (limit, updated_at)
- Run migration on staging
- Verify with test data

**Phase 2: Backend API**
- Implement `addressRepository.ts`
- Add zone derivation helper
- Unit test all functions
- Verify RLS with integration tests

**Phase 3: Frontend UI**
- Create `AddressManager.tsx`
- Create `AddressForm.tsx`
- Create `AddressCard.tsx`
- Add to account page
- Responsive design
- Accessibility audit

**Phase 4: Checkout integration**
- Modify `CheckoutPage.tsx`
- Add address selection UI
- Add save-address checkbox
- Pre-fill form from saved address
- Save new address on checkout

**Phase 5: Testing**
- End-to-end tests
- Cross-browser testing
- Mobile testing
- Accessibility testing
- Performance testing

**Phase 6: Deployment**
- Deploy migration to production
- Monitor for errors
- Gather user feedback
- Iterate on UI/UX

---

## Dependencies

- **S02-01 Country enforcement:** Zone derivation logic
- **S02-03 Checkout/cart audit:** Existing checkout flow
- **Authentication:** Customer session management
- **RLS:** Owner-scoped access control

---

## Risks

**Low risk:**
- Additive feature (no breaking changes)
- Existing checkout flow preserved
- RLS prevents data leakage
- Max 5 addresses prevents abuse

**Mitigations:**
- Feature flag for gradual rollout
- Comprehensive test coverage
- Rollback plan documented
- Performance monitoring

---

## Future Enhancements (Out of Scope)

- Address autocomplete (Google Places API)
- Geocoding for zone derivation
- Address validation (postal service)
- Bulk address import
- Address sharing (family/business accounts)
- International addresses (multi-country)

---

**Specification prepared by:** S02 Consolidated Execution Coordinator  
**Date:** 2026-11-03  
**Status:** Ready for implementation authorization
