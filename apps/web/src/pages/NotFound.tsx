import { Link } from "react-router";
import { PageHero, pill, pillGhost } from "../components/ui.tsx";

export default function NotFound() {
  return (
    <PageHero kicker="404 · continue?" title="This level doesn't exist" sub="The page moved or never launched. The board is still live.">
      <div className="flex flex-wrap justify-center gap-3">
        <Link to="/arcade" className={pill}>
          Back to the arcade
        </Link>
        <Link to="/" className={pillGhost}>
          Start screen
        </Link>
      </div>
    </PageHero>
  );
}
