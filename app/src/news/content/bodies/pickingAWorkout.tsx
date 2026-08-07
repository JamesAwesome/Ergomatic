import { Link } from "react-router-dom";
import TypeBadge from "../../../components/TypeBadge";

export function PickingAWorkoutBody() {
  return (
    <>
      <p>
        Standing in front of a library of three hundred workouts, you need
        answers to exactly three questions. How much time do I have? What kind
        of work does my week need? And how much should today hurt?
      </p>

      <p>
        The first two are mechanical. The library shows each workout's length,
        and the filters cut to what fits. Type follows the pyramid: if most of
        your recent rows were already hard, today probably isn't the day for
        more. If everything lately has been steady <TypeBadge type="O2" />, a
        threshold or interval piece earns its place.
      </p>

      <p>
        The third question is what the pain figure is for. Every workout carries
        an expected <Link to="/news/pain-scale">pain from 1 to 5</Link>: a
        forecast of how much the piece asks of you, not how complicated it is.
        Difficulty (easy, medium, hard) is a separate figure for a separate
        question: how much skill and structure the workout demands. A long
        steady row can be easy and a 2, and a short set of sprints can be easy
        and a 4. Longer never automatically means more painful. Some of the
        gentlest sessions in the library are the longest.
      </p>

      <p>
        Today's suggestion already thinks this way. It reads your preferences,
        your time cap, and what you've rowed lately, then offers something that
        fits; the filters on Today let you narrow it further on the spot. The
        library is there when you'd rather choose by hand.
      </p>

      <p>
        The honest heuristic: most days, pick something you can finish well. A
        workout you complete at its target teaches your body something; a
        workout you crawl away from mostly teaches you to dread the erg. Save
        the 4s and 5s for days you arrive rested, and don't stack them back to
        back. The pyramid does more for you than heroics do.
      </p>
    </>
  );
}
