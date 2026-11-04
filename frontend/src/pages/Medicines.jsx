import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Pill,
  Plus,
  Clock,
  Calendar,
  Utensils,
  Trash2,
  Edit2,
  Box,
  Search,
  CheckCircle2,
  X,
  AlertTriangle
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { api } from '../services/api';
import {
  isArduinoConnected,
  sendMedicineReminder,
  removeMedicineReminder,
  formatTo24Hour
} from '../arduinoSerial';

export default function Medicines({ onNotify }) {
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Edit modal state
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    dosage: '',
    dosage_unit: 'mg',
    schedule_time: '',
    frequency: 'Once a day',
    meal_instruction: 'After Meal',
    notes: ''
  });

  const loadMedicines = async () => {
    try {
      const data = await api.getMedicines();
      setMedicines(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMedicines();
  }, []);

  // Open Edit Modal
  const handleOpenEdit = (med) => {
    setEditTarget(med);
    setEditForm({
      name: med.name || '',
      dosage: med.dosage || '',
      dosage_unit: med.dosage_unit || 'mg',
      schedule_time: med.schedule_time || '08:00 AM',
      frequency: med.frequency || 'Once a day',
      meal_instruction: med.meal_instruction || 'After Meal',
      notes: med.notes || ''
    });
  };

  // Submit Edit
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editTarget) return;

    try {
      const formatted24Time = formatTo24Hour(editForm.schedule_time);
      const updatedData = { ...editForm, schedule_time: formatted24Time };

      await api.updateMedicine(editTarget.id, updatedData);

      // Synchronize with Arduino if connected
      if (isArduinoConnected()) {
        try {
          await sendMedicineReminder({
            id: editTarget.id,
            schedule_time: formatted24Time
          });
        } catch (hwErr) {
          console.warn('Failed to update hardware reminder:', hwErr);
        }
      }

      setEditTarget(null);
      await loadMedicines();
      if (onNotify) {
        onNotify({
          title: 'Medicine updated successfully',
          desc: `${editForm.name} changes saved and synchronized.`,
          type: 'success'
        });
      }
    } catch (err) {
      if (onNotify) {
        onNotify({
          title: 'Unable to update medicine',
          desc: err.message || 'Please try again.',
          type: 'error'
        });
      }
    }
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      const medName = deleteTarget.name;
      const medId = deleteTarget.id;

      await api.deleteMedicine(medId);

      // Remove reminder from Arduino if connected
      if (isArduinoConnected()) {
        try {
          await removeMedicineReminder(medId);
        } catch (hwErr) {
          console.warn('Failed to remove reminder from hardware:', hwErr);
        }
      }

      setDeleteTarget(null);
      await loadMedicines();
      if (onNotify) {
        onNotify({
          title: 'Medicine deleted successfully',
          desc: `${medName} was removed from records and hardware schedule.`,
          type: 'success'
        });
      }
    } catch (err) {
      if (onNotify) {
        onNotify({
          title: 'Unable to delete medicine',
          desc: err.message || 'Please try again.',
          type: 'error'
        });
      }
    }
  };

  const filtered = medicines.filter((m) =>
    (m.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (m.dosage || '').toLowerCase().includes(search.toLowerCase()) ||
    (m.notes || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <p>Loading your prescriptions...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            My Prescriptions
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            All active medications configured in your personal schedule
          </p>
        </div>

        <Link to="/add-medicine" className="btn btn-primary">
          <Plus size={18} />
          <span>Add Medicine</span>
        </Link>
      </div>

      {/* Search Bar */}
      {medicines.length > 0 && (
        <div
          className="card"
          style={{
            padding: '0.85rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}
        >
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)'
              }}
            />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '2.4rem' }}
              placeholder="Search by medicine name, dosage, or note..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Medicine Cards or Empty State */}
      {medicines.length === 0 ? (
        /* Requirement #27: Empty state */
        <div
          className="card"
          style={{
            textAlign: 'center',
            padding: '3.5rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem'
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'var(--primary-50)',
              color: 'var(--primary-500)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem'
            }}
          >
            💊
          </div>
          <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            No medicines scheduled
          </h3>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: 1.5 }}>
            Add your first medicine to start managing your daily schedule.
          </p>
          <Link to="/add-medicine" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
            <Plus size={18} />
            <span>Add Medicine</span>
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
          <p>No medicines match your search "{search}".</p>
        </div>
      ) : (
        <div className="grid-2">
          {filtered.map((m) => (
            <div
              key={m.id}
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '1rem',
                borderLeft: '5px solid var(--primary-500)'
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '12px',
                      background: 'var(--primary-50)',
                      color: 'var(--primary-500)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <Pill size={24} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {m.name}
                    </h3>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary-600)' }}>
                      {m.dosage} {m.dosage_unit || ''}
                    </div>
                  </div>
                </div>
              </div>

              {/* Details Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  background: 'var(--bg-card-subtle)',
                  borderRadius: 'var(--radius-md)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem' }}>
                  <Clock size={16} color="var(--primary-500)" />
                  <span><strong>Time:</strong> {m.schedule_time}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem' }}>
                  <Calendar size={16} color="var(--primary-500)" />
                  <span><strong>Frequency:</strong> {m.frequency || 'Daily'}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem' }}>
                  <Utensils size={16} color="var(--status-pending-dot)" />
                  <span><strong>Meal:</strong> {m.meal_instruction || 'With water'}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem' }}>
                  <Box size={16} color="var(--primary-600)" />
                  <span><strong>Box Slot:</strong> Compartment #{m.slot || 1}</span>
                </div>
              </div>

              {m.notes && (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  💡 {m.notes}
                </div>
              )}

              {/* Actions: Edit & Delete buttons */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '0.65rem',
                  paddingTop: '0.5rem',
                  borderTop: '1px solid var(--border-light)'
                }}
              >
                <button
                  type="button"
                  onClick={() => handleOpenEdit(m)}
                  className="btn btn-secondary btn-sm"
                  style={{ gap: '0.35rem' }}
                >
                  <Edit2 size={14} />
                  <span>Edit</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDeleteTarget(m)}
                  className="btn btn-outline-danger btn-sm"
                  style={{ gap: '0.35rem' }}
                >
                  <Trash2 size={14} />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal (Requirement #9) */}
      {deleteTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '420px',
              width: '100%',
              padding: '1.75rem',
              borderRadius: '20px',
              boxShadow: 'var(--shadow-lg)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', color: 'var(--status-missed-dot)' }}>
              <AlertTriangle size={24} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Delete this medicine?
              </h3>
            </div>
            <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.4 }}>
              Are you sure you want to remove <strong>{deleteTarget.name}</strong> from your medicine schedule? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="btn btn-outline-danger"
                style={{ background: '#ef4444', color: '#fff', borderColor: '#ef4444' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Medicine Modal (Requirement #8) */}
      {editTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '560px',
              width: '100%',
              padding: '1.75rem',
              borderRadius: '20px',
              boxShadow: 'var(--shadow-lg)',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Edit Medicine
              </h3>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="btn-icon btn-secondary"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label className="form-label">Medicine Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Dosage</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editForm.dosage}
                    onChange={(e) => setEditForm({ ...editForm, dosage: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Unit</label>
                  <select
                    className="form-select"
                    value={editForm.dosage_unit}
                    onChange={(e) => setEditForm({ ...editForm, dosage_unit: e.target.value })}
                  >
                    <option value="mg">mg</option>
                    <option value="tablet">tablet</option>
                    <option value="capsule">capsule</option>
                    <option value="ml">ml</option>
                    <option value="drops">drops</option>
                  </select>
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Schedule Time</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editForm.schedule_time}
                    onChange={(e) => setEditForm({ ...editForm, schedule_time: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Meal Instruction</label>
                  <select
                    className="form-select"
                    value={editForm.meal_instruction}
                    onChange={(e) => setEditForm({ ...editForm, meal_instruction: e.target.value })}
                  >
                    <option value="After Breakfast">After Breakfast</option>
                    <option value="Before Breakfast">Before Breakfast</option>
                    <option value="After Lunch">After Lunch</option>
                    <option value="Before Lunch">Before Lunch</option>
                    <option value="After Dinner">After Dinner</option>
                    <option value="Before Dinner">Before Dinner</option>
                    <option value="Before Bed">Before Bed</option>
                    <option value="With Food">With Food</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
