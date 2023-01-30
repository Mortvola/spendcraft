import { HistoryCategoryProps } from '../../common/ResponseTypes';

class HistoryCategory {
  id: number;

  months: {
    expenses: number,
    funding: number,
  }[]

  constructor(props: HistoryCategoryProps) {
    this.id = props.id;
    this.months = props.months;
  }
}

export default HistoryCategory;
