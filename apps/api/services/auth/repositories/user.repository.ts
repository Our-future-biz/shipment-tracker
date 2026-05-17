import { BaseRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { userTable } from "../schemas/user.schema";

class UserRepository extends BaseRepository<typeof userTable> {
  constructor() {
    super(db as never, userTable, "app_user");
  }

  async findByEmail(email: string) {
    return this.getByColumn(userTable.email, email.toLowerCase());
  }
}

export const userRepository = new UserRepository();
