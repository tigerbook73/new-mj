import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";

const RULESETS = [
  { id: "junk", label: "Junk Hu" },
  { id: "bloodbattle", label: "Bloodbattle" },
] as const;

export function GamePickerView() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-lg font-medium">Choose a game</h1>
      <div className="flex gap-4">
        {RULESETS.map((ruleset) => (
          <Button key={ruleset.id} onClick={() => void navigate(`/lobby/${ruleset.id}`)}>
            {ruleset.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
