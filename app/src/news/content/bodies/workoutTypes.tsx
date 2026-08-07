import { Link } from "react-router-dom";
import TypeBadge from "../../../components/TypeBadge";
import { PyramidFigure } from "./PyramidFigure";

export function WorkoutTypesBody() {
  return (
    <>
      <p>
        Every workout in the library carries a type chip:{" "}
        <TypeBadge type="O2" /> <TypeBadge type="AT" /> <TypeBadge type="TR" />{" "}
        <TypeBadge type="AN" />. The chip names the job that workout does, and
        each job feels different from the inside. You'll meet the same four
        chips on every workout card in Today and the Library.
      </p>

      <p>
        <TypeBadge type="O2" /> <strong>Aerobic.</strong> General endurance:
        steady rowing at a moderate effort, usually thirty minutes or more. You
        should be able to hold a conversation. Nothing about an{" "}
        <TypeBadge type="O2" /> piece feels impressive while you're doing it.
        That is the point: this is the work that builds the engine everything
        else borrows from. Most of your metres should be <TypeBadge type="O2" />{" "}
        metres.
      </p>

      <p>
        <TypeBadge type="AT" /> <strong>Anaerobic threshold.</strong> Moderate
        intervals with roughly as much rest as work; a typical shape is four
        4-minute pieces with four minutes of easy rowing between them. An{" "}
        <TypeBadge type="AT" /> piece lives at an odd, specific effort: you
        could still speak, but you would rather not. Call it conversational pace
        while totally out of breath. The job is to find the line where your body
        stops keeping up with the effort, then row just under that line for
        longer each time.
      </p>

      <p>
        <TypeBadge type="TR" /> <strong>Transport.</strong> The hard-intervals
        band of the pyramid: short, high-intensity pieces with rests around
        three times the work, like 1-minute efforts with three minutes between
        them. The odd name is shorthand for lactate clearance: these pieces put
        you past the threshold on purpose, so your body gets better at clearing
        the build-up and you learn to keep rowing through it. These pieces are
        as much mental as physical.
      </p>

      <p>
        <TypeBadge type="AN" /> <strong>Anaerobic.</strong> Very short bursts of
        half a minute to a minute and a half, with long rests of four or five
        times the work. <TypeBadge type="AN" /> is never about endurance. The
        job is power, and turning your top speed up.
      </p>

      <p>
        <strong>The pyramid.</strong> Stack the four types by how much of your
        training each should get and you get a pyramid: a wide{" "}
        <TypeBadge type="O2" /> base, a solid band of <TypeBadge type="AT" />, a
        thinner band of <TypeBadge type="TR" />, and a small{" "}
        <TypeBadge type="AN" /> tip.
      </p>

      <PyramidFigure />

      <p>
        That shape is the whole training philosophy in one picture. The base
        carries the tip: hard intervals only turn into speed when there is an
        aerobic engine underneath them, and piling on intensity without the base
        is how plateaus and injuries happen. If a week of suggestions looks
        suspiciously gentle, the app is not going easy on you. That is the
        pyramid at work.
      </p>

      <p>
        One caveat: the types blur at the edges. A hard interval session for a
        fit rower can be a threshold piece for a newer one. This is why every
        workout also carries a difficulty and an expected pain. The type names
        the job; the other two say how big it is.{" "}
        <Link to="/news/picking-a-workout">Picking a workout</Link> covers how
        to use those two numbers.
      </p>
    </>
  );
}
