import { useState, useEffect } from 'react';
import { listAddresses, createAddress, updateAddress, deleteAddress, setDefaultAddress, type SavedAddress, type NewAddress } from './addressRepository';
import { getSupabaseClient } from '../../lib/supabase/client';
import { useAuth } from '../auth/AuthContext';
import { AddressCard } from './AddressCard';
import { AddressForm } from './AddressForm';

export function AddressManager() {
  const { session } = useAuth();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SavedAddress | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    const userId = session.user.id;
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await listAddresses(getSupabaseClient(), userId);
        if (active) setAddresses(data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load addresses');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [session?.user?.id]);

  async function reload() {
    if (!session?.user?.id) return;
    const userId = session.user.id;
    try {
      setError(null);
      const data = await listAddresses(getSupabaseClient(), userId);
      setAddresses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load addresses');
    }
  }

  async function handleCreate(address: NewAddress) {
    if (!session?.user) return;
    try {
      setError(null);
      await createAddress(getSupabaseClient(), session.user.id, address);
      await reload();
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save address');
    }
  }

  async function handleUpdate(addressId: string, updates: Partial<NewAddress>) {
    if (!session?.user) return;
    try {
      setError(null);
      await updateAddress(getSupabaseClient(), addressId, session.user.id, updates);
      await reload();
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update address');
    }
  }

  async function handleDelete(addressId: string) {
    if (!session?.user) return;
    if (!confirm('Delete this address?')) return;
    try {
      setError(null);
      await deleteAddress(getSupabaseClient(), addressId, session.user.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete address');
    }
  }

  async function handleSetDefault(addressId: string) {
    if (!session?.user) return;
    try {
      setError(null);
      await setDefaultAddress(getSupabaseClient(), addressId, session.user.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set default address');
    }
  }

  if (loading) {
    return <div className="address-manager" role="status">Loading addresses...</div>;
  }

  return (
    <div className="address-manager">
      <h2>Saved Addresses</h2>
      <p className="address-count">{addresses.length} of 5 addresses used</p>
      
      {error && (
        <div role="alert" className="address-error">
          {error}
        </div>
      )}

      {addresses.length < 5 && !showForm && !editing && (
        <button 
          type="button"
          className="add-address-btn"
          onClick={() => setShowForm(true)}
        >
          Add New Address
        </button>
      )}

      {showForm && (
        <AddressForm
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="address-list" role="list">
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

      {addresses.length === 0 && !showForm && (
        <p className="no-addresses">No saved addresses yet. Add one to speed up checkout.</p>
      )}
    </div>
  );
}
