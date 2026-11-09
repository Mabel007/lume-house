import { useState } from 'react';
import type { SavedAddress, NewAddress } from './addressRepository';
import { deliveryConfig } from '../../config/fulfilment';

type AddressFormProps = {
  address?: SavedAddress;
  onSubmit: (address: NewAddress) => void;
  onCancel: () => void;
};

export function AddressForm({ address, onSubmit, onCancel }: AddressFormProps) {
  const [label, setLabel] = useState(address?.label || '');
  const [street, setStreet] = useState(address?.street_address || '');
  const [area, setArea] = useState(address?.area || '');
  const [city, setCity] = useState(address?.city || '');
  const [zoneId, setZoneId] = useState(address?.zone_id || '');
  const [isDefault, setIsDefault] = useState(address?.is_default || false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      label: label.trim(),
      street_address: street.trim(),
      area: area.trim(),
      city: city.trim(),
      zone_id: zoneId,
      is_default: isDefault,
    });
  }

  const activeZones = deliveryConfig.zones.filter(z => z.active);

  return (
    <form onSubmit={handleSubmit} className="address-form">
      <h3>{address ? 'Edit Address' : 'New Address'}</h3>
      
      <div className="form-field">
        <label htmlFor="address-label">
          Label (Home, Work, or custom)
          <input
            id="address-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={20}
            required
            autoComplete="off"
          />
        </label>
      </div>

      <div className="form-field">
        <label htmlFor="address-street">
          Street Address
          <input
            id="address-street"
            type="text"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            maxLength={200}
            required
            autoComplete="street-address"
          />
        </label>
      </div>

      <div className="form-field">
        <label htmlFor="address-area">
          Area
          <input
            id="address-area"
            type="text"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            maxLength={200}
            required
            autoComplete="address-level2"
          />
        </label>
      </div>

      <div className="form-field">
        <label htmlFor="address-city">
          City
          <input
            id="address-city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            maxLength={200}
            required
            autoComplete="address-level1"
          />
        </label>
      </div>

      <div className="form-field">
        <label htmlFor="address-zone">
          Delivery Zone
          <select
            id="address-zone"
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            required
          >
            <option value="">Choose your delivery zone</option>
            {activeZones.map(zone => (
              <option key={zone.id} value={zone.id}>
                {zone.coverage} — {(zone.fee / 100).toFixed(zone.fee % 100 ? 2 : 0)} NLE
              </option>
            ))}
          </select>
        </label>
        <p className="small-note">
          Select the zone that covers your delivery address.
        </p>
      </div>

      <div className="form-field checkbox-field">
        <label>
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          Set as default address
        </label>
      </div>

      <div className="form-actions">
        <button type="submit" className="save-btn">Save</button>
        <button type="button" className="cancel-btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
