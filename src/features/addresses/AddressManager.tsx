import { useState, useEffect, useRef } from 'react';
import { listAddresses, createAddress, updateAddress, deleteAddress, setDefaultAddress, type SavedAddress, type NewAddress } from './addressRepository';
import { getSupabaseClient } from '../../lib/supabase/client';
import { useAuth } from '../auth/AuthContext';
import { AddressCard } from './AddressCard';
import { AddressForm } from './AddressForm';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { UiStatus } from '../../components/UiStatus';

type DeletionPhase = 'pending' | 'gone' | 'failed';

type Deletion = {
  id: string;
  index: number;
  opener: HTMLElement | null;
  phase: DeletionPhase;
};

// A focused element that gets removed or disabled sends the keyboard user to <body>, and asking
// for focus there is indistinguishable from having it, so every destination is checked first.
function focusControl(destination: HTMLElement | null): boolean {
  if (!destination?.isConnected) return false;
  if (destination instanceof HTMLButtonElement && destination.disabled) return false;
  destination.focus();
  return destination === document.activeElement;
}

function cardControl(card: Element | null | undefined, selector: string): HTMLElement | null {
  return card?.querySelector<HTMLElement>(selector) ?? null;
}

function findCard(surface: Element | null, addressId: string): Element | null {
  return surface?.querySelector(`[data-address-id="${addressId}"]`) ?? null;
}

export function AddressManager() {
  const { session } = useAuth();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SavedAddress | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SavedAddress | null>(null);
  const [deletion, setDeletion] = useState<Deletion | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

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

  useEffect(() => {
    if (!deletion) return;
    if (deletion.phase === 'pending') {
      // The dialog unmounts and the card actions go inert in this same commit, so the browser has
      // already dropped focus to <body>; the heading holds the reader's place until the write ends.
      focusControl(heading.current);
      return;
    }
    const cards = surface.current ? [...surface.current.querySelectorAll('[data-address-id]')] : [];
    if (deletion.phase === 'gone') {
      // The row that took the deleted address's slot keeps the keyboard user in the same place.
      const survivor = cards[deletion.index] ?? cards[deletion.index - 1];
      if (!focusControl(cardControl(survivor, '.delete-btn'))) focusControl(heading.current);
      return;
    }
    const opener = deletion.opener?.isConnected ? deletion.opener : cardControl(findCard(surface.current, deletion.id), '.delete-btn');
    if (!focusControl(opener)) focusControl(heading.current);
  }, [deletion]);

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

  async function mutate(operation: () => Promise<void>, fallback: string) {
    if (busy || !session?.user) return;
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  function handleCreate(address: NewAddress) {
    return mutate(async () => {
      const userId = session?.user?.id;
      if (!userId) return;
      await createAddress(getSupabaseClient(), userId, address);
      await reload();
      setShowForm(false);
    }, 'Failed to save address');
  }

  function handleUpdate(addressId: string, updates: Partial<NewAddress>) {
    return mutate(async () => {
      const userId = session?.user?.id;
      if (!userId) return;
      await updateAddress(getSupabaseClient(), addressId, userId, updates);
      await reload();
      setEditing(null);
    }, 'Failed to update address');
  }

  async function handleDelete(addressId: string) {
    let removed = false;
    await mutate(async () => {
      const userId = session?.user?.id;
      if (!userId) return;
      await deleteAddress(getSupabaseClient(), addressId, userId);
      await reload();
      removed = true;
    }, 'Failed to delete address');
    return removed;
  }

  function handleSetDefault(addressId: string) {
    return mutate(async () => {
      const userId = session?.user?.id;
      if (!userId) return;
      await setDefaultAddress(getSupabaseClient(), addressId, userId);
      await reload();
    }, 'Failed to set default address');
  }

  function confirmDelete() {
    const address = pendingDelete;
    setPendingDelete(null);
    if (!address) return;
    setDeletion({
      id: address.id,
      index: addresses.findIndex(item => item.id === address.id),
      opener: cardControl(findCard(surface.current, address.id), '.delete-btn'),
      phase: 'pending',
    });
    // mutate() swallows the failure into `error`, so the resolved value is what distinguishes
    // a deleted row from one the shopper can retry.
    void handleDelete(address.id).then(removed => {
      setDeletion(current => current && current.id === address.id ? { ...current, phase: removed ? 'gone' : 'failed' } : current);
    });
  }

  if (loading) {
    return <UiStatus kind="loading" className="address-manager">Loading addresses…</UiStatus>;
  }

  return (
    <div ref={surface} className="address-manager" aria-busy={busy || undefined}>
      <h2 ref={heading} tabIndex={-1}>Saved Addresses</h2>
      <p className="address-count" aria-live="polite">{addresses.length} of 5 addresses used</p>
      
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
          busy={busy}
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="address-list" role="list">
        {addresses.map(address => (
          <AddressCard
            key={address.id}
            address={address}
            busy={busy}
            onEdit={() => setEditing(address)}
            onDelete={() => setPendingDelete(address)}
            onSetDefault={() => handleSetDefault(address.id)}
          />
        ))}
      </div>

      {editing && (
        <AddressForm
          address={editing}
          busy={busy}
          onSubmit={(updates) => handleUpdate(editing.id, updates)}
          onCancel={() => setEditing(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this address?"
          description={`“${pendingDelete.label}” will be removed from your saved addresses.`}
          confirmLabel="Delete address"
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}

      {addresses.length === 0 && !showForm && (
        <p className="no-addresses">No saved addresses yet. Add one to speed up checkout.</p>
      )}
    </div>
  );
}
