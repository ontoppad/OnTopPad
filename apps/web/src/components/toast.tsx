import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { txUrl } from "../lib/chain.ts";

interface Toast {
  id: number;
  title: string;
  body?: ReactNode;
  tx?: string;
  tone?: "ok" | "error";
}

const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-2), { ...t, id }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 7_000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed z-50 bottom-20 md:bottom-6 right-4 left-4 md:left-auto md:w-96 flex flex-col gap-2 pointer-events-none" aria-live="polite">
        <AnimatePresence initial={false}>
          {list.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto rounded-xl border border-line-2 bg-card p-4 shadow-[0_8px_24px_rgb(0_0_0/0.25)]"
            >
              <div className="flex items-start gap-3">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${t.tone === "error" ? "bg-down" : "bg-lime"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">{t.title}</p>
                  {t.body && <div className="mt-1 text-[13px] text-ink-2">{t.body}</div>}
                  {t.tx && (
                    <a href={txUrl(t.tx)} target="_blank" rel="noreferrer" className="mt-2 inline-block num text-[12px] text-ink-3 hover:text-ink">
                      View transaction
                    </a>
                  )}
                </div>
                <button aria-label="Dismiss" onClick={() => setList((l) => l.filter((x) => x.id !== t.id))} className="text-ink-3 hover:text-ink">
                  <X size={16} strokeWidth={1.5} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
