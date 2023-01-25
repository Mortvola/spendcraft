import React from 'react';
import { Formik, FieldArray, FormikState } from 'formik';
import { DateTime } from 'luxon';
import { DropdownButton } from 'react-bootstrap';
import { FormCheckbox, FormField, SubmitButton } from '@mortvola/forms';
import Http from '@mortvola/http';
import Amount from '../Amount';
import { useStores } from '../State/mobxStore';
import useSortableTable from './SortableTable';
import ReportControls from './ReportControls';
import styles from './Payee.module.css';

type PayeeReport = {
  [key: string]: string | number,
  rowNumber: string,
  name: string,
  sum: number,
  paymentChannel: string,
  count: number,
};

const Payee: React.FC = () => {
  const { accounts } = useStores();
  const { setData, SortableTable } = useSortableTable<PayeeReport>(['name', 'paymentChannel', 'sum', 'count']);

  type FormValues = {
    startDate: string,
    endDate: string,
    inStoreFilter: boolean,
    onlineFilter: boolean,
    otherFilter: boolean,
    unknownFilter: boolean,
    account: { id: number, value: boolean}[],
  }

  const handleSubmit = async (values: FormValues): Promise<void> => {
    let qp = `startDate=${values.startDate}&endDate=${values.endDate}`;

    if (values.inStoreFilter) {
      qp += '&pc=instore';
    }

    if (values.onlineFilter) {
      qp += '&pc=online'
    }

    if (values.otherFilter) {
      qp += '&pc=other';
    }

    if (values.unknownFilter) {
      qp += '&pc=unknown';
    }

    values.account.forEach((a) => {
      if (a.value) {
        qp += `&a=${a.id}`
      }
    })

    const response = await Http.get(`/api/v1/reports/payee?${qp}`);

    if (response.ok) {
      const body = await response.body();

      const isPayeeReport = (r: unknown): r is PayeeReport[] => (
        Array.isArray(r)
        && (r.length === 0 || (
          (r as PayeeReport[])[0].name !== undefined
        ))
      )

      if (isPayeeReport(body)) {
        setData(body);
      }
    }
  }

  return (
    <div className="payee-report window window1">
      <Formik<FormValues>
        initialValues={{
          startDate: DateTime.now().minus({ years: 1 }).toISODate(),
          endDate: DateTime.now().toISODate(),
          inStoreFilter: true,
          onlineFilter: true,
          otherFilter: true,
          unknownFilter: true,
          account: (accounts.institutions.flatMap((i) => (
            i.accounts.filter((a) => (
              a.tracking === 'Transactions'
            )))
            .map((a) => (
              {
                value: true,
                id: a.id,
              }
            )))),
        }}
        onSubmit={handleSubmit}
      >
        {
          ({ isSubmitting }: FormikState<FormValues>) => (
            <ReportControls>
              <FormField name="startDate" type="date" label="Start Date:" />
              <FormField name="endDate" type="date" label="End Date:" />
              <DropdownButton id="test" title="Payment Channels">
                <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: '0.5rem' }}>
                  <FormCheckbox name="inStoreFilter" label="In Store" />
                  <FormCheckbox name="onlineFilter" label="Online" />
                  <FormCheckbox name="otherFilter" label="Other" />
                  <FormCheckbox name="unknownFilter" label="Unknown" />
                </div>
              </DropdownButton>
              <DropdownButton id="test" title="Accounts">
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    paddingLeft: '0.5rem',
                    overflowY: 'auto',
                    maxHeight: '300px',
                  }}
                >
                  <FieldArray name="account">
                    {
                      () => {
                        let index = -1;
                        return (accounts.institutions.flatMap((i) => (
                          i.accounts.filter((a) => (
                            a.tracking === 'Transactions'
                          )))
                          .map((a) => {
                            index += 1;
                            return (
                              <FormCheckbox key={a.id} name={`account[${index}].value`} label={`${i.name}:${a.name}`} />
                            )
                          })))
                      }
                    }
                  </FieldArray>
                </div>
              </DropdownButton>
              <SubmitButton
                isSubmitting={isSubmitting}
                label="Run Report"
                submitLabel="Running Report"
              />
            </ReportControls>
          )
        }
      </Formik>
      <SortableTable>
        <SortableTable.Header className={`title ${styles.reportItem}`}>
          <SortableTable.Column column="name">
            Name
          </SortableTable.Column>
          <SortableTable.Column column="paymentChannel">
            Payment Channel
          </SortableTable.Column>
          <SortableTable.Column className="dollar-amount" column="sum">
            Amount
          </SortableTable.Column>
          <SortableTable.Column style={{ textAlign: 'right' }} column="count">
            Count
          </SortableTable.Column>
          <div style={{ overflowY: 'scroll', visibility: 'hidden', padding: 0 }} />
        </SortableTable.Header>
        <SortableTable.Body>
          {
            (d) => (
              <div key={d.rowNumber} className={styles.reportItem}>
                <div className="ellipsis">{d.name}</div>
                <div>{d.paymentChannel}</div>
                <Amount amount={d.sum} />
                <div style={{ textAlign: 'right' }}>{d.count}</div>
              </div>
            )
          }
        </SortableTable.Body>
      </SortableTable>
    </div>
  )
}

export default Payee;
