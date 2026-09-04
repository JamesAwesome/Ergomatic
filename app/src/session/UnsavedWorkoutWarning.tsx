export default function UnsavedWorkoutWarning({
  count,
  replacement,
  onView,
  onCancel,
  onReplace,
  replaceLabel,
}: {
  count: number;
  replacement: "Connecting" | "Starting a new one";
  onView: () => void;
  onCancel: () => void;
  onReplace: () => void;
  replaceLabel: string;
}) {
  const plural = count > 1;
  return (
    <div className="baseline-confirm">
      <h2 className="unsaved-warning-title">
        {plural ? "You have unsaved workouts." : "You have an unsaved workout."}
      </h2>
      <p className="unsaved-warning-copy">
        Review and save {plural ? "them" : "it"} from Today.
        <br />
        {replacement} discards {plural ? "them" : "it"}.
      </p>
      <button type="button" className="unsaved-review" onClick={onView}>
        View unsaved
      </button>
      <div className="unsaved-secondary">
        <button type="button" className="button-outline" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="button-outline unsaved-replace"
          onClick={onReplace}
        >
          {replaceLabel}
        </button>
      </div>
    </div>
  );
}
