import type { SavedAddress } from './addressRepository';
import { deliveryConfig } from '../../config/fulfilment';

type AddressCardProps = {
  address: SavedAddress;
  busy?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
};

export function AddressCard({ address, busy = false, onEdit, onDelete, onSetDefault }: AddressCardProps) {
  const zone = deliveryConfig.zones.find(z => z.id === address.zone_id);
  
  return (
    <div
      className={`address-card ${address.is_default ? 'default' : ''}`}
      data-address-id={address.id}
      role="listitem"
      aria-label={`${address.label} address`}
    >
      <div className="address-header">
        <h3 className="address-label">
          {address.label}
          {address.is_default && (
            <span className="default-badge" aria-label="Default address">
              Default
            </span>
          )}
        </h3>
      </div>
      
      <div className="address-details">
        <p className="address-street">{address.street_address}</p>
        <p className="address-area-city">
          {address.area}, {address.city}
        </p>
        {zone && (
          <p className="address-zone">
            Delivery zone: {zone.coverage}
          </p>
        )}
      </div>
      
      <div className="address-actions">
        {!address.is_default && (
          <button
            type="button"
            className="set-default-btn"
            onClick={onSetDefault}
            disabled={busy}
            aria-label={`Set ${address.label} as default address`}
          >
            Set as Default
          </button>
        )}
        <button
          type="button"
          className="edit-btn"
          onClick={onEdit}
          disabled={busy}
          aria-label={`Edit ${address.label} address`}
        >
          Edit
        </button>
        <button
          type="button"
          className="delete-btn"
          onClick={onDelete}
          disabled={busy}
          aria-label={`Delete ${address.label} address`}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
