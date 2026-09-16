import { spawnSync } from "node:child_process";
import { platform as currentPlatform } from "node:os";

function command(bin, args) {
  const result = spawnSync(bin, args, {
    encoding: "utf8",
    timeout: 2000,
    maxBuffer: 1024 * 1024,
  });
  return result.status === 0
    ? { value: result.stdout.trim() }
    : {
        unavailable:
          result.error?.message ??
          result.stderr?.trim() ??
          `exit ${result.status}`,
      };
}

export function parseProcesses(output) {
  const lines = output.trim().split("\n");
  return lines.map((line) => {
    const match = line
      .trim()
      .match(
        /^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+[\d:]+\s+\d+)\s+(.+)$/,
      );
    if (!match) throw new Error("Incomplete process census");
    return {
      pid: Number(match[1]),
      ppid: Number(match[2]),
      pgid: Number(match[3]),
      uid: Number(match[4]),
      rssKiB: Number(match[5]),
      started: match[6],
      executable: match[7],
    };
  });
}

export function readHost({
  platform = currentPlatform(),
  command: read = command,
} = {}) {
  const ps = read("/bin/ps", [
    "-axo",
    "pid=,ppid=,pgid=,uid=,rss=,lstart=,comm=",
  ]);
  let processes = ps;
  if (ps.value !== undefined) {
    try {
      processes = { value: parseProcesses(ps.value) };
    } catch (error) {
      processes = { unavailable: error.message };
    }
  }
  if (platform !== "darwin") {
    return {
      processes,
      pressure: {
        state: "unknown",
        unavailable: `Unsupported local platform: ${platform}`,
      },
    };
  }
  const pressure = read("/usr/sbin/sysctl", [
    "-n",
    "kern.memorystatus_vm_pressure_level",
  ]);
  return {
    processes,
    pressure: {
      ...pressure,
      state:
        new Map([
          ["1", "normal"],
          ["2", "warning"],
          ["4", "critical"],
        ]).get(pressure.value) ?? "unknown",
    },
    swap: read("/usr/sbin/sysctl", ["-n", "vm.swapusage"]),
  };
}

// This is explicit cooperative workflow configuration, not authentication
// against a same-user process able to manufacture an entire environment.
export function hostedMode(env = process.env) {
  const flag = env.ERGOMATIC_HOSTED_CI;
  if (flag === undefined || flag === "" || flag === "0" || flag === "false")
    return false;
  if (
    flag !== "1" ||
    env.CI !== "true" ||
    env.GITHUB_ACTIONS !== "true" ||
    env.RUNNER_ENVIRONMENT !== "github-hosted" ||
    !/^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? "") ||
    !/^[1-9]\d*$/.test(env.GITHUB_RUN_ATTEMPT ?? "") ||
    !env.GITHUB_WORKSPACE?.startsWith("/")
  ) {
    throw new Error(
      "Invalid explicit hosted CI context; local admission is not bypassed",
    );
  }
  return true;
}
