import { HistoryMonthProps } from '../../common/ResponseTypes';

class HistoryMonth {
  year: number;

  month: number;

  amount: number;

  constructor(props: HistoryMonthProps) {
    this.year = props.year;
    this.month = props.month;
    this.amount = props.amount;
  }
}

export default HistoryMonth;
