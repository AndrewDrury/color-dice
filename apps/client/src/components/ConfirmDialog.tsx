import { Button } from "./Button";
import { Dialog } from "./Dialog";

/** For rare actions outside the flow of play (leave, kick, rematch). */
export function ConfirmDialog(props: {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog title={props.title} onClose={props.onCancel}>
      {props.body ? <p>{props.body}</p> : null}
      <div class="row" style={{ justifyContent: "flex-end" }}>
        <Button onClick={props.onCancel}>Cancel</Button>
        <Button variant="primary" onClick={props.onConfirm}>
          {props.confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
