import { DateTime } from 'luxon';
import { PlaidLogInterface, PlaidLogProps } from './State';

class PlaidLog implements PlaidLogInterface {
  id: number;

  createdAt: DateTime;

  request: string;

  response: unknown;

  status: number;

  constructor(props: PlaidLogProps) {
    this.id = props.id;
    this.createdAt = DateTime.fromISO(props.createdAt);
    this.request = props.request;
    this.response = props.response;
    this.status = props.status;
  }
}

export default PlaidLog;
