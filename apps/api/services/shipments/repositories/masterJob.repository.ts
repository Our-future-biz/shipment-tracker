import { BaseRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { masterJobTable } from "../schemas/masterJob.schema";

class MasterJobRepository extends BaseRepository<typeof masterJobTable> {
  constructor() {
    super(db as never, masterJobTable, "master_job");
  }

  async findByMczNumber(mczNumber: string) {
    return this.getByColumn(masterJobTable.mczNumber, mczNumber);
  }
}

export const masterJobRepository = new MasterJobRepository();
