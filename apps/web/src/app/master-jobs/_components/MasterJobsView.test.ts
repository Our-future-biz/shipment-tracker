import { describe, expect, it } from "vitest";
import { masterJobTabs } from "./MasterJobsView";

// Mock test S21-044: an air master job's tabs say MAWB, and show Container Details only with a container.
describe("a master job's tabs by its freight mode (mock test S21-044)", () => {
  const labels = (mode: string, containers: number) => masterJobTabs(mode, containers).map((t) => t.label);

  it("are as before on a sea master job, or one with no mode, containers or not", () => {
    const sea = ["MBL Details", "Container Details", "Linked Shipments", "Costs Breakdown", "Documents", "Tracking"];
    expect(labels("Sea Freight", 0)).toEqual(sea);
    expect(labels("Sea Freight", 2)).toEqual(sea);
    expect(labels("", 0)).toEqual(sea);
  });

  it("name MAWB Details on an air master job and leave out Container Details while it has none", () => {
    expect(labels("Air Freight", 0)).toEqual(["MAWB Details", "Linked Shipments", "Costs Breakdown", "Documents", "Tracking"]);
    // One entered before the mode changed can still be reached.
    expect(labels("Air Freight", 1)).toEqual(["MAWB Details", "Container Details", "Linked Shipments", "Costs Breakdown", "Documents", "Tracking"]);
    expect(masterJobTabs("Air Freight", 0)[0]!.key).toBe("mbl");
  });
});
