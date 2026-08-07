import { afterAll, beforeAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";
import { createDb, type Db } from "../../db/index.js";
import { createUserStore } from "../../auth/users.js";
import { createArticleReadsStore } from "../articleReads.js";
import { createBaselinesStore } from "../baselines.js";
import { createWorkoutsStore } from "../workouts.js";
import { createLogsStore } from "../logs.js";
import { createPlanStateStore } from "../planState.js";
import { createPreferencesStore } from "../preferences.js";
import { createTestHistoryStore } from "../testHistory.js";
import {
  describeArticleReadsContract,
  describeStoreContracts,
  type ArticleReadsStoresUnderTest,
  type StoresUnderTest,
} from "./storeContracts.js";

// Run FIRST, against a real Postgres via Testcontainers. Real behavior IS
// the specification for the contract cases in storeContracts.ts — if a case
// doesn't match what happens here, the case is wrong and gets fixed, not
// this store. contracts.fake.test.ts then runs the SAME cases against the
// in-memory fakes to prove they're honest about matching this.
let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let db: Db;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18.4").start();
  ({ pool, db } = createDb(container.getConnectionUri()));
  await migrate(db, { migrationsFolder: "drizzle" });
}, 120_000);

afterAll(async () => {
  await pool.end().catch(() => {});
  await container.stop().catch(() => {});
});

async function makeStores(): Promise<StoresUnderTest> {
  const users = createUserStore(db);
  return {
    baselines: createBaselinesStore(db),
    workouts: createWorkoutsStore(db),
    logs: createLogsStore(db),
    planState: createPlanStateStore(db),
    preferences: createPreferencesStore(db),
    testHistory: createTestHistoryStore(db),
    async makeUser() {
      const id = crypto.randomUUID();
      const user = await users.createUser({
        googleSub: `contract-real-${id}`,
        email: `${id}@contracts.test`,
        name: "Contract User",
      });
      return user.id;
    },
    async seedGlobalWorkout(input) {
      const [row] = await createWorkoutsStore(db).createMany(null, [input]);
      return row;
    },
  };
}

describeStoreContracts(makeStores, { label: "real Postgres" });

async function makeArticleReadsStores(): Promise<ArticleReadsStoresUnderTest> {
  const users = createUserStore(db);
  return {
    articleReads: createArticleReadsStore(db),
    async makeUser() {
      const id = crypto.randomUUID();
      const user = await users.createUser({
        googleSub: `contract-real-ar-${id}`,
        email: `${id}@contracts.test`,
        name: "Contract User",
      });
      return user.id;
    },
  };
}

describeArticleReadsContract(makeArticleReadsStores, {
  label: "real Postgres",
});
