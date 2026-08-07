import BackLink from "../shell/BackLink";
import { RELEASE_NOTES } from "./content/releaseNotes";
import { releaseDate } from "./newsDates";

// The release-notes list (Phase 6H Task 6): every RELEASE_NOTES entry, no
// read state anywhere on it (unlike News's WHAT'S NEW card, which only ever
// shows the newest one). Reuses News's own `.news-whatsnew`/
// `.news-release-version`/`.news-release-items` card styling per entry —
// this screen doesn't invent new visual language, just repeats the card.
export default function Releases() {
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
