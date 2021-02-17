import { makeAutoObservable, runInAction } from 'mobx';

class Reports {
  constructor(store) {
    this.reportType = null;
    this.data = null;

    makeAutoObservable(this);

    this.store = store;
  }

  async loadReport(reportType) {
    switch (reportType) {
      case 'netWorth': {
        const response = await fetch('/reports/networth');

        if (response.ok) {
          const body = await response.json();

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
