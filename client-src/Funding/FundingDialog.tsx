import { formatMoneyCents, addMoneyCents, parseMoneyCents, subtractMoneyCents } from
  '../../common/moneyCents';
import { decodeCentFundingRules, inputMoneyCents, type TransferCategoryInput } from '../monetary';
import { validateFundingPercentages } from '../../common/fundingPercentages'
import React from 'react';
import {
  Field, FieldProps,
  FormikErrors, FormikContextType,
} from 'formik';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import { FormModal, FormError, setFormErrors } from '@mortvola/forms';
import { DateTime } from 'luxon';
import Http from '@mortvola/http';
import MoneyCentsAmount from '../MoneyCentsAmount';
import { useStores } from '../State/Store';
import {
  TransactionType,
  ApiResponse,
  ProposedFundingCategoryProps,
  CategoryType,
} from '../../common/ResponseTypes';
import Funding from './Funding';
import {
  type CategoriesValueType,
  type ValueType,
} from './Types'
import styles from './Funding.module.scss'
import { CategoryInterface, TransactionInterface } from '../State/Types';
import { calculateFunding, fundingCalculationInputs, fundingCategoryEffectCents } from
  './calculateFunding';

interface PropsType {
  transaction?: TransactionInterface;
}

const FundingDialog: React.FC<PropsType & ModalProps> = ({
  transaction,
  setShow,
}) => {
  const { categoryTree, register } = useStores();
  const { budget: { fundingPoolCat } } = categoryTree;

  if (!fundingPoolCat) {
    throw new Error('funding pool is unassigned');
  }

  const zero = parseMoneyCents('0.00');
  const previousPoolEffect = transaction ? addMoneyCents(...transaction.categories.flatMap((
    category, index) => (
    category.categoryId === fundingPoolCat.id ? [transaction.getCategoryAmountCents(index)] : []
  ))) : zero;
  const poolEffectCents = (categories: CategoriesValueType) => (
    fundingCategoryEffectCents(calculateFunding(fundingCalculationInputs(categories), fundingPoolCat
      .id), fundingPoolCat.id)
  );

  const poolPreview = (categories: CategoriesValueType) => {
    try {
      const effect = poolEffectCents(categories);
      return {
        available: addMoneyCents(fundingPoolCat.balanceCents, effect, subtractMoneyCents(zero,
          previousPoolEffect)),
        total: subtractMoneyCents(zero, effect),
        additional: subtractMoneyCents(previousPoolEffect, effect),
      };
    }
    catch { return null; } // Incomplete or unsafe edits must not crash the preview.
  };

  const [diffOnly, setDiffOnly] = React.useState<boolean>(false);

  const handleSubmit = async (values: ValueType) => {
    interface Request {
      date: string,
      categories: TransferCategoryInput[],
    }

    const categories = calculateFunding(fundingCalculationInputs(values.categories), fundingPoolCat
      .id)
      .map(({ amountCents, ...category }) => ({ ...category, amount: formatMoneyCents(
        amountCents) }));

    const request: Request = {
      date: transaction ? transaction.date.toISODate() ?? values.date : values.date,
      categories,
    };

    let errors: Error[] | null;
    if (transaction) {
      errors = await transaction.updateCategoryTransfer(request);
    }
    else {
      errors = await register.addCategoryTransfer(request, TransactionType.FUNDING_TRANSACTION);
    }

    if (!errors) {
      setShow(false);
    }
  };

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};

    if (values.date === '') {
      errors.date = 'A date must be specified.';
    }

    for (const [id, category] of Object.entries(values.categories)) {
      try { fundingCalculationInputs({ [id]: category }); }
      catch {
        errors.categories ??= {};
        errors.categories[id] = { baseAmount:
          'Enter valid, safe funding amounts and percentages.' };
      }
      const issue = validateFundingPercentages(category.fundingCategories)
      if (issue) {
        errors.categories ??= {}
        errors.categories[id] = { fundingCategories: issue.message }
      }
    }

    // Verify that there is at least one non-zero funding item.
    let count = 0;

    Object.keys(values.categories).forEach((k) => {
      const value = values.categories[k];
      try {
        if (inputMoneyCents(value.baseAmount) !== 0) count += 1;
      }
      catch { /* Invalid input is reported above. */ }
    });

    if (count === 0) { //  && errors.funding) {
      console.log('At least one non-zero funding item must be entered.');
    }

    return errors;
  };

  const handleDelete = async (context: FormikContextType<ValueType>) => {
    const { setTouched, setErrors } = context;

    if (transaction) {
      const errors = await transaction.delete();

      if (errors) {
        setTouched({ [errors[0].field]: true }, false);
        setFormErrors(setErrors, errors);
      }
      else {
        setShow(false)
      }
    }
  }

  const initialFundingDate = React.useCallback(() => (
    (transaction
      ? transaction.date
      : DateTime.now().startOf('month')
    ).toISODate()
  ), [transaction]);

  const initialFunding = (): CategoriesValueType | undefined => {
    if (transaction) {
      const obj: CategoriesValueType = {}

      transaction.categories.forEach((c) => {
        if (!c.funder) {
          let { fundingCategories } = c;

          if (fundingCategories === undefined) {
            const category = categoryTree.getCategory(c.categoryId)

            if (!category) {
              throw new Error(`category not found: ${c.categoryId}`)
            }

            fundingCategories = [{
              categoryId: category.getFundingPool().id,
              amount: 100,
              percentage: true,
            }]
          }

          obj[c.categoryId] = {
            // Retain decimal text until the funding calculation boundary.
            baseAmount: formatMoneyCents(c.baseAmountCents ?? c.amountCents),
            fundingCategories: fundingCategories?.map(rule => {
              if (rule.percentage) return rule;
              const { amountCents, ...metadata } = rule;
              return { ...metadata, amount: formatMoneyCents(amountCents) };
            }) ?? [],
            includeFundingTransfers: c.includeFundingTransfers ?? false,
          }
        }
      })

      // Add to the transaction any category that is not yet represented
      categoryTree.budget.forEachCatgory((node: CategoryInterface) => {
        if (obj[node.id] === undefined) {
          obj[node.id] = {
            baseAmount: '0.00',
            fundingCategories: [{
              categoryId: node.getFundingPool().id,
              amount: 100,
              percentage: true,
            }],
            includeFundingTransfers: false,
          }
        }
      })

      // Add to the transaction any bill that is not yet represented
      categoryTree.bills.forEachCatgory((node: CategoryInterface) => {
        if (obj[node.id] === undefined) {
          obj[node.id] = {
            baseAmount: '0.00',
            fundingCategories: [{
              categoryId: node.getFundingPool().id,
              amount: 100,
              percentage: true,
            }],
            includeFundingTransfers: false,
          }
        }
      })

      return obj;
    }

    return undefined;
  }

  const [categories, setCategories] = React.useState<CategoriesValueType | undefined>(
    initialFunding())

  const handleCheckChange = () => {
    setDiffOnly((prev) => (!prev));
  }

  const getProposed = React.useCallback(async (date: string) => {
    const response = await Http.get<ApiResponse<ProposedFundingCategoryProps[]>>(
      `/api/v1/funding-plans/proposed?date=${date}`,
    );

    if (response.ok) {
      const { data } = (await response.body());

      if (data) {
        const obj: CategoriesValueType = {};

        data.forEach((cat) => {
          const category = categoryTree.getCategory(cat.categoryId)

          if (category && ![CategoryType.AccountTransfer, CategoryType.Unassigned].includes(category
            .type)) {
            obj[cat.categoryId] = {
              baseAmount: formatMoneyCents(parseMoneyCents(cat.amount)),
              fundingCategories: [],
              includeFundingTransfers: cat.includeFundingTransfers,
            }

            let fundingCats = decodeCentFundingRules(cat.fundingCategories).map(rule => {
              if (rule.percentage) return rule;
              const { amountCents, ...metadata } = rule;
              return { ...metadata, amount: formatMoneyCents(amountCents) };
            });

            if (fundingCats.length === 0) {
              const fundingPool = category.getFundingPool()

              fundingCats = [{
                categoryId: fundingPool.id,
                amount: 100.0,
                percentage: true,
              }];
            }

            for (const fundingCat of fundingCats) {
              obj[cat.categoryId].fundingCategories.push(fundingCat.percentage
                ? { categoryId: fundingCat.categoryId, amount: fundingCat.amount, percentage: true }
                : { categoryId: fundingCat.categoryId, amount: fundingCat.amount,
                  percentage: false });
            }
          }
        })

        return obj
      }
    }

    return null;
  }, [categoryTree]);

  React.useEffect(() => {
    (async () => {
      if (!transaction) {
        const date = DateTime.fromISO(
          initialFundingDate() ?? DateTime.now().toISODate(),
        ).startOf('month').toISODate() ?? '';

        const obj = await getProposed(date)

        if (obj) {
          setCategories(obj)
        }
      }
    })();
  }, [getProposed, initialFundingDate, transaction]);

  if (!categories) {
    return null;
  }

  return (
    <FormModal<ValueType>
      setShow={setShow}
      initialValues={{
        date: initialFundingDate() ?? '',
        categories,
      }}
      validate={handleValidate}
      onSubmit={handleSubmit}
      title="Fund Categories"
      formId="fundingDialogForm"
      onDelete={transaction ? handleDelete : null}
    >
      <div className="fund-container">
        <div className="funding-header">
          <label>
            Date:
            <Field name="date">
              {
                ({ field, form }: FieldProps) => (
                  <input
                    {...field}
                    type="date"
                    disabled={!!transaction}
                    className="form-control"
                    onChange={(event) => {
                      if (!transaction) {
                        (async () => {
                          const obj = await getProposed(event.target.value)

                          if (obj) {
                             
                            for (const [categoryId, value] of Object.entries(obj)) {
                              form.setFieldValue(`categories.${categoryId}.baseAmount`, value
                                .baseAmount)
                            }
                          }
                        })()
                      }
                      field.onChange(event)
                    }}
                  />
                )
              }
            </Field>
          </label>
          <FormError name="date" />
          <label>
            Available Funds:
            <Field>
              {
                ({ form: { values } }: FieldProps<unknown, ValueType>) => {
                  const preview = poolPreview(values.categories);
                  return preview ? <MoneyCentsAmount className="form-control" amount={preview
                    .available} /> : <div>Invalid amount</div>;
                }
              }
            </Field>
          </label>
        </div>
        <label>
          <input type="checkbox" checked={diffOnly} onChange={handleCheckChange} className={styles
            .checkbox} />
          Show only differences in funding
        </label>
        <div className="cat-fund-table">
          <Field>
            {({
              form: {
                values,
              },
            }: FieldProps<unknown, ValueType>) => (
              <Funding
                date={DateTime.fromISO(values.date).startOf('month').toISODate() ?? ''}
                diffOnly={diffOnly}
              />
            )}
          </Field>
          <FormError name="funding" />
        </div>
        <div className={`${styles.fundListItem} ${styles.catFundTitle}`}>
          <div className={styles.fundListCatName} />
          <div className={styles.labeledAmount}>
            Total
            <Field>
              {
                ({ form: { values } }: FieldProps<unknown, ValueType>) => {
                  const preview = poolPreview(values.categories);
                  return preview ? <MoneyCentsAmount style={{ minWidth: '6rem' }} amount={preview
                    .total} /> : <div>Invalid amount</div>;
                }
              }
            </Field>
          </div>
          {transaction && (
            <label>
              Additional Pool withdrawal:
              <Field>
                {({ form: { values } }: FieldProps<unknown, ValueType>) => {
                  const preview = poolPreview(values.categories);
                  return preview ? <MoneyCentsAmount amount={preview.additional} /
                    > : <div>Invalid amount</div>;
                }}
              </Field>
            </label>
          )}
          <div className={`dollar-amount ${styles.fundListAmt}`} />
        </div>
      </div>
    </FormModal>
  );
};

export const useFundingDialog = makeUseModal<PropsType>(FundingDialog);
