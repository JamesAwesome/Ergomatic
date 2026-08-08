import { useLayoutEffect } from "react";
import BackLink from "../shell/BackLink";
import { RELEASE_NOTES } from "./content/releaseNotes";
import { releaseDate } from "./newsDates";

// The release-notes list (Phase 6H Task 6): every RELEASE_NOTES entry, no
// read state anywhere on it (unlike News's WHAT'S NEW card, which only ever
// shows the newest one). Reuses News's own `.news-whatsnew`/
// `.news-release-version`/`.news-release-items` card styling per entry —
// this screen doesn't invent new visual language, just repeats the card.
export default function Releases() {
  // Item 1 (2026-08-07 device report): opened from a scrolled News feed,
  // this screen used to keep that scroll position too. This screen only
  // ever mounts once per visit (no in-place slug navigation like Reader
  // has), so `[]` deps are enough. useLayoutEffect for the same reason as
  // Reader's (see its comment): scroll before paint, ahead of iOS Safari's
  // own late scroll pass.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <main className="screen releases-screen">
      <BackLink fallback="/news" />
      <h1 className="screen-title">Release notes</h1>
      {RELEASE_NOTES.map((release) => (
        <section key={release.version} className="news-whatsnew">
          <p className="news-release-version">
            {release.version} · {releaseDate(release.date)}
          </p>
          <ul className="news-release-items">
            {release.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
