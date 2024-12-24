import React from 'react';
import { Formik, FieldArray, FormikState } from 'formik';
import { DateTime } from 'luxon';
import { DropdownButton } from 'react-bootstrap';
import { FormCheckbox, FormField, SubmitButton } from '@mortvola/forms';
import Http from '@mortvola/http';
import Amount from '../Amount';
import { useStores } from '../State/Store';
import useSortableTable from './SortableTable';
import { isGroup } from '../State/Group';
import ReportControls from './ReportControls';
import styles from './Category.module.scss';
import { CategoryType } from '../../common/ResponseTypes';

type CategoryReport = {
  rowNumber: string,
  groupName: string,
  categoryName: string,
  sum: number,
  count: number,
};

const Category: React.FC = () => {
  const { categoryTree: { budget } } = useStores();
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

    const response = await Http.get(`/api/v1/reports/category?${qp}`);

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
    <div className="payee-report window window1">
      <Formik<FormValues>
        initialValues={{
          startDate: DateTime.now().minus({ years: 1 }).toISODate() ?? '',
          endDate: DateTime.now().toISODate() ?? '',
          category: (budget.children.flatMap((g) => {
            if (isGroup(g)) {
              return g.children.filter((c) => (
                c.type === CategoryType.Regular
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
        {
          ({ isSubmitting }: FormikState<FormValues>) => (
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
                        return (budget.children.flatMap((g) => {
                          if (isGroup(g)) {
                            return g.children.filter((c) => (
                              c.type === CategoryType.Regular
                            ))
                              .map((c) => {
                                index += 1;
                                return (
                                  <FormCheckbox key={c.id} name={`category[${index}].value`} label={`${g.name}:${c.name}`} />
                                )
                              })
                          }

                          index += 1;
                          return (
                            <FormCheckbox key={g.id} name={`category[${index}].value`} label={`${g.name}`} />
                          )
                        }))
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
          <SortableTable.Column column="groupName">
            Group
          </SortableTable.Column>
          <SortableTable.Column column="categoryName">
            Category
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
