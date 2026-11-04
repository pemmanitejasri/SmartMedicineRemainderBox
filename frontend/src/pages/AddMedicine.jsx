
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Pill,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import { api } from "../services/api";
import {
  isArduinoConnected,
  sendMedicineReminder,
  formatTo24Hour
} from "../arduinoSerial";

export default function AddMedicine({ onNotify }) {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [dosageValue, setDosageValue] = useState("");
  const [dosageUnit, setDosageUnit] = useState("mg");
  const [scheduleTime, setScheduleTime] = useState("");
  const [frequency, setFrequency] = useState("Once a day");
  const [mealInstruction, setMealInstruction] =
    useState("After Breakfast");
  const [slot, setSlot] = useState(1);
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const notify = (title, desc, type) => {
    onNotify?.({ title, desc, type });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      notify("Validation Error", "Please enter a medicine name.", "error");
      return;
    }

    if (!dosageValue.trim()) {
      notify("Validation Error", "Please enter a dosage value.", "error");
      return;
    }

    if (!scheduleTime) {
      notify("Validation Error", "Please select a reminder time.", "error");
      return;
    }

    const formatted24Time = formatTo24Hour(scheduleTime);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(formatted24Time)) {
      notify("Validation Error", "Please enter a valid reminder time (HH:MM).", "error");
      return;
    }

    setSaving(true);
    let medicineSaved = false;

    try {
      const res = await api.addMedicine({
        name: name.trim(),
        dosage: dosageValue.trim(),
        dosage_unit: dosageUnit,
        schedule_time: formatted24Time,
        frequency,
        meal_instruction: mealInstruction,
        slot: Number(slot),
        start_date: startDate,
        end_date: endDate || null,
        notes: notes.trim(),
      });

      medicineSaved = true;

      if (res?.isOfflineSaved) {
        notify(
          "Medicine saved offline",
          `${name.trim()} saved locally. It will sync with cloud and Smart Box once connected.`,
          "success"
        );
        navigate("/medicines");
        return;
      }

      // If Arduino is connected, send schedule immediately and verify ACK
      if (isArduinoConnected()) {
        try {
          await sendMedicineReminder({
            id: res.id,
            schedule_time: formatted24Time
          });

          notify(
            "Medicine added successfully",
            `${name.trim()} saved and reminder confirmed by Smart Box for ${formatted24Time}.`,
            "success"
          );
        } catch (hardwareError) {
          notify(
            "Medicine saved, hardware pending",
            `Saved to database, but Arduino did not confirm the reminder (${hardwareError.message}). Check connection and click 'Sync Reminders'.`,
            "warning"
          );
        }
      } else {
        notify(
          "Medicine saved successfully",
          `${name.trim()} saved to database. Medicine Box is disconnected — reminder will synchronize once connected.`,
          "info"
        );
      }

      navigate("/medicines");
    } catch (err) {
      notify(
        medicineSaved
          ? "Medicine saved, but another step failed"
          : "Unable to save medicine",
        err.message || "Please try again.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.25rem" }}>
        <Link
          to="/medicines"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            color: "var(--text-secondary)",
            textDecoration: "none",
            fontSize: "0.9rem",
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to Medicines</span>
        </Link>
      </div>

      <div className="card" style={{ padding: "2rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.85rem",
            marginBottom: "1.5rem",
            borderBottom: "1px solid var(--border-light)",
            paddingBottom: "1rem",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: "var(--primary-gradient)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Pill size={24} />
          </div>

          <div>
            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: 800,
                color: "var(--text-primary)",
                letterSpacing: "-0.02em",
                margin: 0,
              }}
            >
              Add Medicine
            </h1>

            <p
              style={{
                fontSize: "0.88rem",
                color: "var(--text-muted)",
              }}
            >
              Add medicine details and set its reminder time.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="med-name">
                Medicine Name *
              </label>
              <input
                id="med-name"
                type="text"
                className="form-input"
                placeholder="e.g. Paracetamol"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="dosage">
                Dosage & Unit *
              </label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  id="dosage"
                  type="text"
                  className="form-input"
                  placeholder="e.g. 500"
                  value={dosageValue}
                  onChange={(e) => setDosageValue(e.target.value)}
                  style={{ flex: 1 }}
                  required
                />

                <select
                  className="form-select"
                  style={{ width: "130px" }}
                  value={dosageUnit}
                  onChange={(e) => setDosageUnit(e.target.value)}
                >
                  <option value="mg">mg</option>
                  <option value="tablet">tablet</option>
                  <option value="capsule">capsule</option>
                  <option value="ml">ml</option>
                  <option value="drops">drops</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="schedule-time">
                Reminder Time *
              </label>
              <input
                id="schedule-time"
                type="time"
                className="form-input"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="frequency-select">
                Frequency
              </label>
              <select
                id="frequency-select"
                className="form-select"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
              >
                <option value="Once a day">Once a day</option>
                <option value="Twice a day">Twice a day</option>
                <option value="Three times a day">Three times a day</option>
                <option value="As needed">As needed</option>
              </select>
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="meal-instruction">
                Meal Instruction
              </label>
              <select
                id="meal-instruction"
                className="form-select"
                value={mealInstruction}
                onChange={(e) => setMealInstruction(e.target.value)}
              >
                <option value="After Breakfast">After Breakfast</option>
                <option value="Before Breakfast">
                  Before Breakfast (Empty Stomach)
                </option>
                <option value="After Lunch">After Lunch</option>
                <option value="Before Lunch">Before Lunch</option>
                <option value="After Dinner">After Dinner</option>
                <option value="Before Dinner">Before Dinner</option>
                <option value="Before Bed">Before Bed</option>
                <option value="With Food">With Food</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="box-slot">
                Smart Box Compartment Slot
              </label>
              <select
                id="box-slot"
                className="form-select"
                value={slot}
                onChange={(e) => setSlot(e.target.value)}
              >
                <option value={1}>Compartment #1</option>
                <option value={2}>Compartment #2</option>
                <option value={3}>Compartment #3</option>
              </select>
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="start-date">
                Start Date
              </label>
              <input
                id="start-date"
                type="date"
                className="form-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="end-date">
                End Date (Optional)
              </label>
              <input
                id="end-date"
                type="date"
                className="form-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="notes-area">
              Special Instructions / Notes
            </label>
            <textarea
              id="notes-area"
              className="form-textarea"
              rows={2}
              placeholder="e.g. Take with a full glass of water"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "1rem",
              marginTop: "1.5rem",
              borderTop: "1px solid var(--border-light)",
              paddingTop: "1.25rem",
            }}
          >
            <Link to="/medicines" className="btn btn-secondary">
              Cancel
            </Link>

            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
              style={{ minWidth: "160px" }}
            >
              <CheckCircle2 size={18} />
              <span>{saving ? "Saving..." : "Save Medicine"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}