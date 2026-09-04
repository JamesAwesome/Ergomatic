import type { WorkoutType } from "../../domain/types.js";
import { validWorkoutType } from "./recoveryValidation";

export default function MissingWorkoutType({
  value,
  onChange,
}: {
  value: WorkoutType | null;
  onChange: (value: WorkoutType | null) => void;
}) {
  return (
    <div className="recovery-panel">
      <h2 className="unsaved-warning-title">Your recording is here.</h2>
      <p>
        The original workout details aren't available. Choose its workout type
        to save the recorded data.
      </p>
      <label htmlFor="recovery-type">Workout type</label>
      <select
        id="recovery-type"
        value={value ?? ""}
        onChange={(event) => {
          onChange(validWorkoutType(event.target.value));
        }}
      >
        <option value="">Choose a type</option>
        {(["AN", "O2", "AT", "TR"] as const).map((type) => (
          <option key={type}>{type}</option>
        ))}
      </select>
    </div>
  );
}
