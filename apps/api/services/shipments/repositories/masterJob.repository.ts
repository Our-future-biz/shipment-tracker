import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { masterJobTable } from "../schemas/masterJob.schema";

class MasterJobRepository extends TenantRepository<typeof masterJobTable> {
  constructor() {
    super(db as never, masterJobTable, "master_job");
  }

  async findByMczNumber(mczNumber: string, companyId: string) {
    return this.getByColumnForCompany(masterJobTable.mczNumber, mczNumber, companyId);
  }
}

export const masterJobRepository = new MasterJobRepository();
