import { useState } from "react";
import { useSearch } from "../hooks/useSchedulerApi";
import { useDebounce } from "../hooks/useDebounce";

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "text-red-400",
  high: "text-amber-400",
  medium: "text-blue-400",
  low: "text-slate-400",
};
const STATUS_BADGE: Record<string, string> = {
  not_started: "bg-slate-700/60 text-slate-300",
  in_progress: "bg-blue-500/20 text-blue-400",
  completed: "bg-emerald-500/20 text-emerald-400",
  submitted: "bg-purple-500/20 text-purple-400",
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 350);
  const { data: results, isLoading, isFetching } = useSearch(debouncedQuery);

  const totalCount = (results?.students?.length ?? 0) + (results?.assignments?.length ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-ivory">Search</h1>
        <p className="text-slate-400 text-sm mt-1">Find students and assignments</p>
      </div>

      <div className="relative">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          placeholder="Search students or assignments..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input-field w-full pl-12 py-3 text-base"
          autoFocus
        />
        {(isLoading || isFetching) && (
          <div className="absolute inset-y-0 right-4 flex items-center">
            <div className="w-4 h-4 border-2 border-gold/50 border-t-gold rounded-full animate-spin" />
          </div>
        )}
      </div>

      {debouncedQuery.length >= 2 && !isLoading && results && (
        <p className="text-slate-400 text-sm">{totalCount} result{totalCount !== 1 ? "s" : ""} for &ldquo;{debouncedQuery}&rdquo;</p>
      )}

      {debouncedQuery.length < 2 && (
        <div className="card-dark p-12 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-slate-400">Type at least 2 characters to search</p>
        </div>
      )}

      {debouncedQuery.length >= 2 && totalCount === 0 && !isLoading && (
        <div className="card-dark p-12 text-center">
          <div className="text-5xl mb-4">😶</div>
          <p className="text-ivory font-semibold mb-1">No results found</p>
          <p className="text-slate-400 text-sm">Try a different search term</p>
        </div>
      )}

      {results?.students && results.students.length > 0 && (
        <div>
          <h2 className="text-ivory font-semibold mb-3">Students ({results.students.length})</h2>
          <div className="space-y-3">
            {results.students.map((s) => (
              <div key={s.id} className="card-dark p-4 hover:border-slate-600 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ backgroundColor: s.color || "#6366f1" }}>
                    {s.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-ivory font-medium">{highlight(s.name, debouncedQuery)}</p>
                    {s.email && <p className="text-slate-400 text-xs mt-0.5">{highlight(s.email, debouncedQuery)}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700 text-slate-400"}`}>
                    {s.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {results?.assignments && results.assignments.length > 0 && (
        <div>
          <h2 className="text-ivory font-semibold mb-3">Assignments ({results.assignments.length})</h2>
          <div className="space-y-3">
            {results.assignments.map((a) => (
              <div key={a.id} className="card-dark p-4 hover:border-slate-600 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ backgroundColor: a.studentColor || "#94a3b8" }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <h3 className="text-ivory font-medium">{highlight(a.title, debouncedQuery)}</h3>
                        <p className="text-slate-400 text-xs mt-0.5">{a.studentName} {a.className ? `· ${a.className}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs font-bold uppercase ${PRIORITY_COLOR[a.priority] ?? ""}`}>{a.priority}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[a.status] ?? ""}`}>{a.status.replace(/_/g, " ")}</span>
                      </div>
                    </div>
                    <p className="text-slate-500 text-xs mt-2">Due: {new Date(a.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-gold/30 text-gold rounded px-0.5">{part}</mark>
      : part
  );
}
