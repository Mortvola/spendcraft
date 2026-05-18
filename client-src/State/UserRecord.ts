import { DateTime } from "luxon";
import { type UserProps } from "./Types";

class UserRecord {
  username: string

  email: string

  createdAt: DateTime

  constructor(props: UserProps) {
    this.username = props.username
    this.email = props.email
    this.createdAt = DateTime.fromISO(props.createdAt);
  }
}

export default UserRecord;
