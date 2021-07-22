import { HistoryGroupProps } from '../../common/ResponseTypes';
import HistoryCategory from './HistoryCategory';

class HistoryGroup {
  id: number;

  name: string;

  categories: HistoryCategory[];

  constructor(props: HistoryGroupProps) {
    this.id = props.id;
    this.name = props.name;
    this.categories = props.categories;
  }
}

export default HistoryGroup;
