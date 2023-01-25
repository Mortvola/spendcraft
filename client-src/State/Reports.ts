import { makeAutoObservable, runInAction } from 'mobx';
import Http from '@mortvola/http';

export const isNetworthReport = (r: unknown): r is number[][] => (
  true
)

type PayeeReport = {
  name: string,
}[];

export const isPayeeReport = (r: unknown): r is Record<string, string>[] => (
  Array.isArray(r)
  && (r.length === 0 || (
    (r as PayeeReport)[0].name !== undefined
  ))
)

class Reports {
  reportType: string | null = null;

  data: number[][] | Record<string, string>[] | null = null;

  store: unknown;

  constructor(store: unknown) {
    this.data = null;

    makeAutoObservable(this);

    this.store = store;
  }

  async loadReport(reportType: string): Promise<void> {
    switch (reportType) {
      case 'netWorth': {
        const response = await Http.get('/api/v1/reports/networth');

        if (response.ok) {
          const body = await response.body();

          runInAction(() => {
            this.reportType = reportType;
            if (isNetworthReport(body)) {
              this.data = body;
            }
          });
        }

        break;
      }

      case 'payee': {
        const response = await Http.get('/api/v1/reports/payee');

        if (response.ok) {
          const body = await response.body();

          runInAction(() => {
            this.reportType = reportType;
            if (isPayeeReport(body)) {
              this.data = body;
            }
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
