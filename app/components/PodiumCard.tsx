import type { PodiumEntry } from "@/lib/standings/podium";

export default function PodiumCard({
  title,
  podium,
  highlightTeamId,
}: {
  title: string;
  podium: PodiumEntry[];
  highlightTeamId?: string;
}) {
  const [first, ...rest] = podium;
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-amber-900">
      <p className="text-sm">{title}</p>
      {first && (
        <p className="mt-1 text-lg font-bold">
          🏆 {first.label} · {first.teamName}
          {first.teamId === highlightTeamId && " (우리 팀)"}
        </p>
      )}
      {rest.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {rest.map((p) => (
            <li key={p.label} className={p.teamId === highlightTeamId ? "font-semibold" : undefined}>
              {p.label} · {p.teamName}
              {p.teamId === highlightTeamId && " (우리 팀)"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
