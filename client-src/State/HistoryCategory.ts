import { HistoryCategoryProps } from '../../common/ResponseTypes';
import FundingPlanHistoryMonth from './HistoryMonth';

class HistoryCategory {
  id: number;

  months: FundingPlanHistoryMonth[];

  constructor(props: HistoryCategoryProps) {
    this.id = props.id;
    this.months = props.months;
  }
}

export default HistoryCategory;
