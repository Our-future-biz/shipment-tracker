import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { gateMovementService } from "../services/gateMovement.service";
import { gateFileService } from "../services/gateFile.service";

describe("gate files", () => {
  it("uploads, reads back, lists and removes a file within its movement and company", async () => {
    const company = randomUUID();
    const user = randomUUID();
    const m = await gateMovementService.create(company, user, { gateRef: "WCZ2026091610" });
    const body = Buffer.from("fake jpeg bytes");

    const file = await gateFileService.upload(m.id, company, user, {
      fileName: "corner-damage-1.jpg",
      fileType: "image/jpeg",
      contentBase64: body.toString("base64"),
      container: "MSKU 123456-7",
      tag: "PC 3",
    });
    expect(file).toMatchObject({ fileName: "corner-damage-1.jpg", fileSize: body.length, tag: "PC 3", container: "MSKU 123456-7" });

    const content = await gateFileService.content(m.id, file.id, company);
    expect(Buffer.from(content.contentBase64, "base64").toString()).toBe("fake jpeg bytes");
    await expect(gateFileService.content(m.id, file.id, randomUUID())).rejects.toThrow(/not found/);

    expect((await gateFileService.list(m.id, company)).map((f) => f.id)).toEqual([file.id]);
    await gateFileService.remove(m.id, file.id, company);
    expect(await gateFileService.list(m.id, company)).toEqual([]);

    await expect(
      gateFileService.upload(m.id, company, user, { fileName: "empty.pdf", fileType: "application/pdf", contentBase64: "" }),
    ).rejects.toThrow(/empty/);
  });
});
