import { decodePayeeReport, type PayeeCentsReportRow, decodeNetworthReport,
  type NetworthCentsReport } from '../monetary';
import { observable, runInAction } from 'mobx';
import Http from '@mortvola/http';

import { isNetworthReport, type PayeeReportRow } from '../../common/ResponseTypes';

const isPayeeReport = (r: unknown): r is PayeeReportRow[] => (
  Array.isArray(r)
  && (r.length === 0 || (
    (r as PayeeReportRow[])[0].name !== undefined
  ))
)

class Reports {
  @observable
  accessor reportType: string | null = null;

  @observable
  accessor data: NetworthCentsReport | PayeeCentsReportRow[] | null = null;

  store: unknown;

  constructor(store: unknown) {
    this.data = null;

    this.store = store;
  }

  async loadReport(reportType: string): Promise<void> {
    switch (reportType) {
      case 'netWorth': {
        const response = await Http.get('/api/v1/reports/networth');

        if (response.ok) {
          const body = await response.body();

          if (isNetworthReport(body)) {
            const decoded = decodeNetworthReport(body);
            runInAction(() => {
              this.reportType = reportType;
              this.data = decoded;
            });
          }
        }

        break;
      }

      case 'payee': {
        const response = await Http.get('/api/v1/reports/payee');

        if (response.ok) {
          const body = await response.body();

          if (isPayeeReport(body)) {
            const decoded = decodePayeeReport(body);
            runInAction(() => {
              this.reportType = reportType;
              this.data = decoded;
            });
          }
        }

        break;
      }

      default:
        break;
    }
  }
}

export default Reports;
