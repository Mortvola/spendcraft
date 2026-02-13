import { DateTime } from 'luxon';
import { PlaidLogInterface, PlaidLogProps } from './Types';

class PlaidLog implements PlaidLogInterface {
  id: number;

  type: string;

  createdAt: DateTime;

  request: string;

  response: unknown;

  status: number;

  institutionId?: string;

  constructor(props: PlaidLogProps) {
    this.id = props.id;
    this.type = props.type;
    this.createdAt = DateTime.fromISO(props.createdAt);
    this.request = props.request;
    this.response = props.response;
    this.status = props.status;
    this.institutionId = props.institutionId;
  }
}

export const isPlaidLog = (r: unknown): r is PlaidLog => (
  (r as PlaidLog).type === 'Request'
)

export default PlaidLog;
