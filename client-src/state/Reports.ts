import { makeAutoObservable, runInAction } from 'mobx';
import { getBody } from './Transports';

class Reports {
  reportType: string | null = null;

  data: unknown | null = null;

  store: unknown;

  constructor(store: unknown) {
    this.data = null;

    makeAutoObservable(this);

    this.store = store;
  }

  async loadReport(reportType: string): Promise<void> {
    switch (reportType) {
      case 'netWorth': {
        const response = await fetch('/api/reports/networth');

        if (response.ok) {
          const body = await getBody(response);

          runInAction(() => {
            this.reportType = reportType;
            this.data = body;
          });
        }

        break;
      }

      default:
        break;
    }
  }
}

export default Reports;
