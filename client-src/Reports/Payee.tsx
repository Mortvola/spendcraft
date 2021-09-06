import { Formik, Form, FieldArray } from 'formik';
import { DateTime } from 'luxon';
import React, { ReactElement, useContext, useState } from 'react';
import { Button, DropdownButton } from 'react-bootstrap';
import Amount from '../Amount';
import FormCheckbox from '../Modal/FormCheckbox';
import FormField from '../Modal/FormField';
import MobxStore from '../state/mobxStore';
import { getBody, httpGet } from '../state/Transports';

type PayeeReport = {
  rowNumber: string,
  name: string,
  sum: number,
  paymentChannel: string,
  count: number,
};

export const isPayeeReport = (r: unknown): r is PayeeReport[] => (
  Array.isArray(r)
  && (r.length === 0 || (
    (r as PayeeReport[])[0].name !== undefined
  ))
)

const Payee = (): ReactElement | null => {
  const { accounts } = useContext(MobxStore);

  const [data, setData] = useState<PayeeReport[]>([]);

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

    const response = await httpGet(`/api/reports/payee?${qp}`);

    if (response.ok) {
      const body = await getBody(response);

      if (isPayeeReport(body)) {
        setData(body);
      }
    }
  }

  return (
    <div className="payee-report window">
      <Formik<FormValues>
        initialValues={{
          startDate: DateTime.now().minus({ years: 1 }).toISODate(),
          endDate: DateTime.now().toISODate(),
          inStoreFilter: true,
          onlineFilter: true,
          otherFilter: true,
          unknownFilter: true,
          account: accounts.institutions.flatMap((i) => (
            i.accounts.filter((a) => (
              a.tracking === 'Transactions'
            ))
              .map((a) => (
                {
                  value: true,
                  id: a.id,
                }
              ))
          )),
        }}
        onSubmit={handleSubmit}
      >
        <Form className="payee-report-controls">
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
                    return accounts.institutions.flatMap((i) => (
                      i.accounts.filter((a) => (
                        a.tracking === 'Transactions'
                      ))
                        .map((a) => {
                          index += 1;
                          return (
                            <FormCheckbox key={a.id} name={`account[${index}].value`} label={`${i.name}:${a.name}`} />
                          )
                        })
                    ))
                  }
                }
              </FieldArray>
            </div>
          </DropdownButton>
          <Button variant="primary" type="submit">Run Report</Button>
        </Form>
      </Formik>
      <div className="title payee-report-item">
        <div>Name</div>
        <div>Payment Channel</div>
        <div className="dollar-amount">Amount</div>
        <div style={{ textAlign: 'right' }}>Count</div>
        <div style={{ overflowY: 'scroll', visibility: 'hidden', padding: 0 }} />
      </div>
      <div className="striped" style={{ overflowY: 'scroll' }}>
        {
          data !== null
            ? (
              data.map((d) => (
                <div key={d.rowNumber} className="payee-report-item">
                  <div className="ellipsis">{d.name}</div>
                  <div>{d.paymentChannel}</div>
                  <Amount amount={d.sum} />
                  <div style={{ textAlign: 'right' }}>{d.count}</div>
                </div>
              ))
            )
            : null
        }
      </div>
    </div>
  )
}

export default Payee;
