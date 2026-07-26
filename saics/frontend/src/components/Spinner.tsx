import { Loader2 } from "lucide-react";

export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-row">
      <Loader2 size={18} className="spin" />
      {label && <span>{label}</span>}
    </div>
  );
}
