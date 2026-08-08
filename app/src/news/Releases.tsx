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
    // Round 4 (architectural): scrolls in its own element — see
    // .overlay-screen's comment in index.css for why. `tabIndex={0}`
    // matches Plan.tsx's 84-row sequence (Phase 6A, commit a3e5ee6): it
    // puts the scroll region itself in the tab order so a keyboard user can
    // Tab to it and scroll with arrow/Page keys — genuinely useful here,
    // not required by axe's scrollable-region-focusable rule, which this
    // screen would already satisfy via BackLink, its own focusable
    // descendant (`focusable-content`), tabIndex or not. No `key` here —
    // unlike Reader, this screen has no in-place navigation.
    <main className="screen releases-screen overlay-screen" tabIndex={0}>
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
