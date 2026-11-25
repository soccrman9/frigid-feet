import { useState, type FormEvent } from 'react';
import { Check, PackagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Participant, SupplyCategory, SupplyItem } from '../../types/domain';
import { SupplyCategoryIcon } from './SupplyCategoryIcon';
import { getSupplyCategoryLabel, SUPPLY_CATEGORIES } from './supplyConstants';

interface VolunteeredSuppliesSectionProps {
  items: SupplyItem[];
  participantsById: ReadonlyMap<string, Participant>;
  activeParticipant: Participant | null;
  isOrganizer?: boolean;
  isOnline: boolean;
  onAdd: (name: string, category: SupplyCategory) => Promise<void>;
  onUpdate: (supplyItemId: string, name: string, category: SupplyCategory) => Promise<void>;
  onDelete: (supplyItemId: string) => Promise<void>;
}

export function VolunteeredSuppliesSection({
  items,
  participantsById,
  activeParticipant,
  isOrganizer = false,
  isOnline,
  onAdd,
  onUpdate,
  onDelete,
}: VolunteeredSuppliesSectionProps) {
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<SupplyCategory>('food');
  const [adding, setAdding] = useState(false);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<SupplyCategory>('food');
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function handleAddSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!activeParticipant) return;
    if (!isOnline) {
      setErrorMessage('Requires connection to add a Supply.');
      return;
    }

    const trimmed = newName.trim();
    if (trimmed.length === 0) {
      setErrorMessage('Please enter a Supply name before adding.');
      setStatusMessage(null);
      return;
    }

    setAdding(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await onAdd(trimmed, newCategory);
      setNewName('');
      setStatusMessage(`Added ${trimmed}.`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not add that Supply. Please try again.',
      );
    } finally {
      setAdding(false);
    }
  }

  function startEditing(item: SupplyItem) {
    setEditingItemId(item.id);
    setEditName(item.name);
    setEditCategory(item.category);
    setErrorMessage(null);
    setStatusMessage(null);
  }

  function cancelEditing() {
    setEditingItemId(null);
    setEditName('');
    setErrorMessage(null);
  }

  async function handleEditSubmit(formEvent: FormEvent<HTMLFormElement>, item: SupplyItem) {
    formEvent.preventDefault();
    if (!activeParticipant || item.createdByParticipantId !== activeParticipant.id) return;
    if (!isOnline) {
      setErrorMessage('Requires connection to save Supply changes.');
      return;
    }

    const trimmed = editName.trim();
    if (trimmed.length === 0) {
      setErrorMessage('Please enter a Supply name before saving.');
      return;
    }

    setBusyItemId(item.id);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await onUpdate(item.id, trimmed, editCategory);
      setEditingItemId(null);
      setStatusMessage(`Updated ${trimmed}.`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not update that Supply. Please try again.',
      );
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleDelete(item: SupplyItem) {
    const isOwnItem =
      activeParticipant !== null && item.createdByParticipantId === activeParticipant.id;
    if (!isOwnItem && !isOrganizer) return;
    if (!isOnline) {
      setErrorMessage('Requires connection to delete a Supply.');
      return;
    }

    setBusyItemId(item.id);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await onDelete(item.id);
      if (editingItemId === item.id) {
        setEditingItemId(null);
      }
      setStatusMessage(`Removed ${item.name}.`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not delete that Supply. Please try again.',
      );
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <section
      aria-label="Volunteered Supplies"
      className="rounded-md border-[1.5px] p-4"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-strong)',
      }}
    >
      <div>
        <p
          className="flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase"
          style={{ color: 'var(--ink-secondary)' }}
        >
          <PackagePlus size={14} strokeWidth={2.3} aria-hidden="true" />
          <span>Volunteered Supplies</span>
        </p>
        <h2
          id="volunteered-supplies-heading"
          className="mt-0.5 text-lg font-bold"
          style={{ color: 'var(--ink-primary)' }}
        >
          Bringing Something Extra
        </h2>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-secondary)' }}>
          Bringing homemade snacks, extra dry socks, or a thermos? List it here so everyone at
          Basecamp knows what&apos;s coming.
        </p>
      </div>

      {activeParticipant && (
        <form
          onSubmit={(e) => void handleAddSubmit(e)}
          className="mt-3 flex flex-col gap-2.5 rounded-md border p-3"
          style={{
            backgroundColor: 'var(--bg-ground)',
            borderColor: 'var(--border-structural)',
          }}
          noValidate
        >
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_auto]">
            <div>
              <label
                htmlFor="volunteered-supply-name"
                className="mb-1 block text-xs font-bold tracking-wider uppercase"
                style={{ color: 'var(--ink-secondary)' }}
              >
                Supply name
              </label>
              <input
                id="volunteered-supply-name"
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={adding || !isOnline}
                placeholder="e.g. Homemade banana bread"
                className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-3 text-sm font-semibold disabled:opacity-60"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--ink-primary)',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="volunteered-supply-category"
                className="mb-1 block text-xs font-bold tracking-wider uppercase"
                style={{ color: 'var(--ink-secondary)' }}
              >
                Category
              </label>
              <select
                id="volunteered-supply-category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as SupplyCategory)}
                disabled={adding || !isOnline}
                className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-2.5 text-sm font-bold disabled:opacity-60"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--ink-primary)',
                }}
              >
                {SUPPLY_CATEGORIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={adding || !isOnline}
            className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-md border-[1.5px] px-4 text-sm font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              backgroundColor: 'var(--shell-header)',
              borderColor: 'var(--shell-header)',
              color: 'var(--ink-on-shell)',
            }}
          >
            <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
            <span>
              {!isOnline ? 'Requires connection' : adding ? 'Adding…' : 'Add Supply'}
            </span>
          </button>
        </form>
      )}

      {statusMessage && (
        <div
          role="status"
          className="mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold"
          style={{
            backgroundColor: 'var(--accent-spruce-soft)',
            borderColor: 'var(--accent-spruce)',
            color: 'var(--accent-spruce)',
          }}
        >
          <Check size={16} strokeWidth={2.5} aria-hidden="true" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="mt-3 rounded-md border px-3 py-2 text-sm font-semibold"
          style={{
            backgroundColor: 'var(--accent-error-bg)',
            borderColor: 'var(--accent-error-border)',
            color: 'var(--accent-error)',
          }}
        >
          {errorMessage}
        </div>
      )}

      {items.length === 0 ? (
        <p
          className="mt-3 rounded-md border px-3 py-3 text-sm"
          style={{
            backgroundColor: 'var(--bg-ground)',
            borderColor: 'var(--border-hairline)',
            color: 'var(--ink-secondary)',
          }}
        >
          No volunteered Supplies listed yet. Add anything extra you plan to bring!
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2.5">
          {items.map((item) => {
            const creatorName = item.createdByParticipantId
              ? (participantsById.get(item.createdByParticipantId)?.displayName ?? 'Participant')
              : 'Participant';
            const isOwnItem =
              activeParticipant !== null &&
              item.createdByParticipantId === activeParticipant.id;
            const isEditing = editingItemId === item.id;
            const isBusy = busyItemId === item.id;
            const headingId = `volunteered-item-${item.id}`;

            return (
              <article
                key={item.id}
                aria-labelledby={headingId}
                className="rounded-md border-[1.5px] p-3"
                style={{
                  backgroundColor: 'var(--bg-ground)',
                  borderColor: 'var(--border-structural)',
                }}
              >
                {isEditing ? (
                  <form
                    onSubmit={(e) => void handleEditSubmit(e, item)}
                    className="flex flex-col gap-2.5"
                    noValidate
                  >
                    <h3 id={headingId} className="sr-only">
                      {item.name}
                    </h3>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                      <div>
                        <label
                          htmlFor={`edit-supply-name-${item.id}`}
                          className="mb-1 block text-xs font-bold tracking-wider uppercase"
                          style={{ color: 'var(--ink-secondary)' }}
                        >
                          Edit Supply name
                        </label>
                        <input
                          id={`edit-supply-name-${item.id}`}
                          type="text"
                          value={editName}
                          onChange={(e) => {
                            setEditName(e.target.value);
                            if (errorMessage) setErrorMessage(null);
                          }}
                          disabled={isBusy || !isOnline}
                          className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-3 text-sm font-semibold"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-strong)',
                            color: 'var(--ink-primary)',
                          }}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`edit-supply-category-${item.id}`}
                          className="mb-1 block text-xs font-bold tracking-wider uppercase"
                          style={{ color: 'var(--ink-secondary)' }}
                        >
                          Edit category
                        </label>
                        <select
                          id={`edit-supply-category-${item.id}`}
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value as SupplyCategory)}
                          disabled={isBusy || !isOnline}
                          className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-2.5 text-sm font-bold"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-strong)',
                            color: 'var(--ink-primary)',
                          }}
                        >
                          {SUPPLY_CATEGORIES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={isBusy || !isOnline}
                        className="pfl-focus-ring min-h-[44px] flex-1 cursor-pointer rounded-md border-0 px-3 text-sm font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                        style={{
                          backgroundColor: 'var(--accent-amber-cta)',
                          color: '#0C1E30',
                        }}
                      >
                        {!isOnline ? 'Requires connection' : isBusy ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={cancelEditing}
                        className="pfl-focus-ring min-h-[44px] cursor-pointer rounded-md border-[1.5px] px-3 text-sm font-bold"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-strong)',
                          color: 'var(--ink-primary)',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3
                          id={headingId}
                          className="text-base font-bold leading-snug"
                          style={{ color: 'var(--ink-primary)' }}
                        >
                          {item.name}
                        </h3>
                        <span
                          className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-structural)',
                            color: 'var(--ink-secondary)',
                          }}
                        >
                          <SupplyCategoryIcon category={item.category} size={14} />
                          <span>{getSupplyCategoryLabel(item.category)}</span>
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
                        Brought by <span className="font-bold">{creatorName}</span>
                      </p>
                    </div>

                    {(isOwnItem || isOrganizer) && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        {isOwnItem && (
                          <button
                            type="button"
                            disabled={isBusy || !isOnline}
                            onClick={() => startEditing(item)}
                            className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-md border-[1.5px] px-3 text-xs font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: 'var(--border-strong)',
                              color: 'var(--ink-primary)',
                            }}
                          >
                            <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
                            <span>{!isOnline ? 'Requires connection' : 'Edit'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isBusy || !isOnline}
                          aria-label={isOwnItem ? undefined : `Remove ${item.name}`}
                          onClick={() => void handleDelete(item)}
                          className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-md border-[1.5px] px-3 text-xs font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-strong)',
                            color: 'var(--ink-primary)',
                          }}
                        >
                          <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
                          <span>
                            {isBusy
                              ? isOwnItem
                                ? 'Deleting…'
                                : 'Removing…'
                              : isOwnItem
                                ? 'Delete'
                                : 'Remove'}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
