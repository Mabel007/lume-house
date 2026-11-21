import { useId, useState } from 'react';
import type { SavedAddress, NewAddress } from './addressRepository';
import { deliveryConfig } from '../../config/fulfilment';
import { formatMoney } from '../../config/shop';

type AddressFormProps = {
  address?: SavedAddress;
  busy?: boolean;
  onSubmit: (address: NewAddress) => void;
  onCancel: () => void;
};

type FieldKey = 'label' | 'street' | 'area' | 'city' | 'zone';

export function AddressForm({ address, busy = false, onSubmit, onCancel }: AddressFormProps) {
  const [label, setLabel] = useState(address?.label || '');
  const [street, setStreet] = useState(address?.street_address || '');
  const [area, setArea] = useState(address?.area || '');
  const [city, setCity] = useState(address?.city || '');
  const [zoneId, setZoneId] = useState(address?.zone_id || '');
  const [isDefault, setIsDefault] = useState(address?.is_default || false);
  // A create and an edit form can be mounted at once, so ids must come from the instance.
  const uid = useId();
  const fieldId = (key: FieldKey) => `${uid}-address-${key}`;
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});

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

  function update(key: FieldKey, value: string) {
    if (key === 'label') setLabel(value);
    else if (key === 'street') setStreet(value);
    else if (key === 'area') setArea(value);
    else if (key === 'city') setCity(value);
    else setZoneId(value);
  }

  function dropError(key: FieldKey) {
    setErrors((current) => {
      if (!(key in current)) return current;
      const cleared = { ...current };
      delete cleared[key];
      return cleared;
    });
  }

  function describe(key: FieldKey, hintId?: string) {
    return [hintId, errors[key] ? `${fieldId(key)}-error` : undefined].filter(Boolean).join(' ') || undefined;
  }

  function reject(key: FieldKey, event: React.InvalidEvent<HTMLInputElement | HTMLSelectElement>) {
    // React releases the event before a queued updater runs, so the wording is read now.
    const message = event.currentTarget.validationMessage;
    setErrors((current) => ({ ...current, [key]: message }));
  }

  const text = (key: FieldKey, name: string, value: string, autoComplete: string, maxLength: number) => (
    <div className="form-field">
      <label htmlFor={fieldId(key)}>
        {name}
        <span aria-hidden="true"> *</span>
        <input
          id={fieldId(key)}
          type="text"
          value={value}
          onChange={(e) => { update(key, e.target.value); if (e.currentTarget.validity.valid) dropError(key); }}
          onInvalid={(e) => reject(key, e)}
          maxLength={maxLength}
          required
          disabled={busy}
          aria-invalid={errors[key] ? true : undefined}
          aria-describedby={describe(key)}
          autoComplete={autoComplete}
        />
      </label>
      {errors[key] && <p id={`${fieldId(key)}-error`} className="field-error">{errors[key]}</p>}
    </div>
  );

  const activeZones = deliveryConfig.zones.filter(z => z.active);
  const zoneHintId = `${uid}-address-zone-help`;

  return (
    <form onSubmit={handleSubmit} className="address-form" aria-busy={busy || undefined}>
      <h3>{address ? 'Edit Address' : 'New Address'}</h3>

      {text('label', 'Label (Home, Work, or custom)', label, 'off', 20)}
      {text('street', 'Street Address', street, 'street-address', 200)}
      {text('area', 'Area', area, 'address-level2', 200)}
      {text('city', 'City', city, 'address-level1', 200)}

      <div className="form-field">
        <label htmlFor={fieldId('zone')}>
          Delivery Zone
          <span aria-hidden="true"> *</span>
          <select
            id={fieldId('zone')}
            value={zoneId}
            onChange={(e) => { update('zone', e.target.value); if (e.currentTarget.validity.valid) dropError('zone'); }}
            onInvalid={(e) => reject('zone', e)}
            required
            disabled={busy}
            aria-invalid={errors.zone ? true : undefined}
            aria-describedby={describe('zone', zoneHintId)}
          >
            <option value="">Choose your delivery zone</option>
            {activeZones.map(zone => (
              <option key={zone.id} value={zone.id}>
                {zone.coverage} — {formatMoney(zone.fee)}
              </option>
            ))}
          </select>
        </label>
        <p id={zoneHintId} className="small-note">
          Select the zone that covers your delivery address.
        </p>
        {errors.zone && <p id={`${fieldId('zone')}-error`} className="field-error">{errors.zone}</p>}
      </div>

      <div className="form-field checkbox-field">
        <label>
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            disabled={busy}
          />
          Set as default address
        </label>
      </div>

      <div className="form-actions">
        <button type="submit" className="save-btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="cancel-btn" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}
