import { ButtonLink } from "../components/ui.tsx";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center">
      <span className="num text-[13px] text-ink-3">404 · continue?</span>
      <h1 className="text-[36px] font-semibold tracking-tight">This level doesn't exist</h1>
      <p className="text-[15px] text-ink-2">The page moved or never launched</p>
      <ButtonLink to="/" variant="primary" size="lg">
        Back to start
      </ButtonLink>
    </div>
  );
}
