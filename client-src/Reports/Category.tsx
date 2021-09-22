import React, {
  ReactElement, useContext,
} from 'react';
import { Formik, FieldArray } from 'formik';
import { DateTime } from 'luxon';
import { Button, DropdownButton } from 'react-bootstrap';
import Amount from '../Amount';
import FormCheckbox from '../Modal/FormCheckbox';
import FormField from '../Modal/FormField';
import MobxStore from '../State/mobxStore';
import { httpGet } from '../State/Transports';
import useSortableTable from './SortableTable';
import { isGroup } from '../State/Group';
import ReportControls from './ReportControls';

type CategoryReport = {
  rowNumber: string,
  groupName: string,
  categoryName: string,
  sum: number,
  count: number,
};

const Category = (): ReactElement | null => {
  const { categoryTree: { nodes } } = useContext(MobxStore);
  const { setData, SortableTable } = useSortableTable<CategoryReport>(['groupName', 'categoryName', 'sum', 'count']);

  type FormValues = {
    startDate: string,
    endDate: string,
    category: { id: number, value: boolean}[],
  }

  const handleSubmit = async (values: FormValues): Promise<void> => {
    let qp = `startDate=${values.startDate}&endDate=${values.endDate}`;

    values.category.forEach((c) => {
      if (c.value) {
        qp += `&c=${c.id}`
      }
    })

    const response = await httpGet(`/api/reports/category?${qp}`);

    if (response.ok) {
      const body = await response.body();

      const isCategoryReport = (r: unknown): r is CategoryReport[] => (
        Array.isArray(r)
        && (r.length === 0 || (
          (r as CategoryReport[])[0].groupName !== undefined
          && (r as CategoryReport[])[0].categoryName !== undefined
        ))
      )

      if (isCategoryReport(body)) {
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
          category: (nodes.flatMap((g) => {
            if (isGroup(g)) {
              return g.categories.filter((c) => (
                c.type === 'REGULAR'
              ))
                .map((c) => (
                  {
                    value: true,
                    id: c.id,
                  }
                ));
            }

            return ({
              value: true,
              id: g.id,
            })
          })),
        }}
        onSubmit={handleSubmit}
      >
        <ReportControls>
          <FormField name="startDate" type="date" label="Start Date:" />
          <FormField name="endDate" type="date" label="End Date:" />
          <DropdownButton id="test" title="Categories">
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
                    return (nodes.flatMap((g) => {
                      if (isGroup(g)) {
                        g.categories.filter((c) => (
                          c.type === 'REGULAR'
                        ))
                          .map((c) => {
                            index += 1;
                            return (
                              <FormCheckbox key={c.id} name={`category[${index}].value`} label={`${g.name}:${c.name}`} />
                            )
                          })
                      }

                      return (
                        <FormCheckbox key={g.id} name={`category[${index}].value`} label={`${g.name}`} />
                      )
                    }))
                  }
                }
              </FieldArray>
            </div>
          </DropdownButton>
          <Button variant="primary" type="submit">Run Report</Button>
        </ReportControls>
      </Formik>
      <SortableTable>
        <SortableTable.Header className="title payee-report-item">
          <SortableTable.Column column="groupName">
            Group
          </SortableTable.Column>
          <SortableTable.Column column="categoryName">
            Category
          </SortableTable.Column>
          <SortableTable.Column className="dolloar-amount" column="sum">
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
              <div key={d.rowNumber} className="payee-report-item">
                <div className="ellipsis">{d.groupName}</div>
                <div className="ellipsis">{d.categoryName}</div>
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

export default Category;
