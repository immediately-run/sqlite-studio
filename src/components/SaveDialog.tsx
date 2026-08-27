import { useState } from 'react';
import Modal from './Modal';
import type { Store } from '../lib/store';
import { errorCode, errorMessage, normaliseDbName } from '../lib/persist';

interface Props {
  defaultName: string;
  shared: Store | null;
  onPickShared: () => Promise<void>;
  onSave: (dest: 'private' | 'shared', name: string) => Promise<void>;
  onClose: () => void;
}

function SaveDialog({ defaultName, shared, onPickShared, onSave, onClose }: Props) {
  const [name, setName] = useState(defaultName);
  const [dest, setDest] = useState<'private' | 'shared'>('private');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canShared = !!shared && shared.mode === 'rw';

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(dest, normaliseDbName(name));
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const pick = async () => {
    try {
      await onPickShared();
      setDest('shared');
    } catch (e) {
      if (errorCode(e) !== 'cancelled') setError(errorMessage(e));
    }
  };

  return (
    <Modal title="Save database" onClose={onClose}>
      {error && <p className="error">{error}</p>}
      <label className="field">
        <span>File name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <div className="field">
        <span>Where</span>
        <div className="seg" role="group" aria-label="Destination">
          <button type="button" className={dest === 'private' ? 'on' : ''} onClick={() => setDest('private')}>
            My files
          </button>
          <button type="button" className={dest === 'shared' ? 'on' : ''} disabled={!canShared} onClick={() => setDest('shared')}>
            {shared ? `Shared: ${shared.name ?? 'space'}${shared.mode === 'ro' ? ' (read-only)' : ''}` : 'Shared space'}
          </button>
        </div>
        {!shared && (
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => void pick()}>
            Choose a space to share into…
          </button>
        )}
      </div>
      <p className="hint">
        The whole database is written as one file. In a shared space the last writer wins, so coordinate before saving over
        someone else's copy.
      </p>
      <div className="row end">
        <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary btn-sm" type="button" disabled={busy || !name.trim()} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}

export default SaveDialog;
