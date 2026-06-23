import { useMemo } from "react";
import { Swords } from "lucide-react";

const GLADIATOR_GREETINGS = [
  "What we do in the arena echoes in eternity. Close those deals {name}!",
  "Are you not entertained?! Now go entertain those customers with an offer they can't refuse {name}.",
  "Strength and honor — now pick up that phone and conquer {name}!",
  "The Colosseum awaits your victories. How many deals will fall today {name}?",
  "A gladiator never retreats. Neither should your pipeline {name}.",
  "Rome wasn't built in a day but you can close a deal in one call {name}.",
  "Fight for glory fight for commission. Maximus Aurelius stands with you {name}!",
  "The crowd demands blood... I mean sales. Go get them {name}!",
  "In this arena every callback is a battle. Win them all {name}.",
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
