import { useMemo } from "react";
import { Swords } from "lucide-react";

const GLADIATOR_GREETINGS = [
  "At your command, Caesar {name}",
  "Maximus awaits your orders, Commander {name}",
  "Strength and honor, Emperor {name}",
  "Maximus bows before you, {name}",
  "Ready to conquer, my liege {name}",
  "The arena is yours, Caesar {name}",
  "Victory awaits us, Commander {name}",
  "Your gladiator stands ready, {name}",
  "For glory and {name}!",
];

interface MaximusGreetingProps {
  userName: string;
}

export function MaximusGreeting({ userName }: MaximusGreetingProps) {
  const greeting = useMemo(() => {
    const randomIndex = Math.floor(Math.random() * GLADIATOR_GREETINGS.length);
    return GLADIATOR_GREETINGS[randomIndex].replace("{name}", userName || "Commander");
  }, [userName]);

  return (
    <div className="flex items-center gap-2 text-purple-600 font-bold text-lg italic">
      <Swords className="w-5 h-5" />
      <span>{greeting}</span>
    </div>
  );
}
