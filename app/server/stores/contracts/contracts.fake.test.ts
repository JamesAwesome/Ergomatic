import type { NewWorkoutInput } from "../workouts.js";
import { makeFakeStores } from "../../testing/fakes.js";
import {
  describeStoreContracts,
  type StoresUnderTest,
} from "./storeContracts.js";

// Runs the SAME cases as contracts.real.integration.test.ts against the
// in-memory fakes. Real Postgres defines truth (see that file); this suite
// proves the fakes are provably honest about matching it — including the
// two historical regressions (empty-prefs-patch, non-UUID workout id) that
// previously slipped past fakes-only test coverage into production.
let userCounter = 0;

async function makeStores(): Promise<StoresUnderTest> {
  const stores = makeFakeStores();
  return {
    ...stores,
    async makeUser() {
      userCounter += 1;
      return `contract-fake-user-${userCounter}`;
    },
    async seedGlobalWorkout(input: NewWorkoutInput) {
      return (
        stores.workouts as unknown as {
          _seedGlobal: (i: NewWorkoutInput) => {
            id: string;
            num: number;
            title: string;
          };
        }
      )._seedGlobal(input);
    },
  };
}

describeStoreContracts(makeStores, { label: "in-memory fakes" });
